# Prose + documentation propagation — bundle #900/#901/#902/#903

Worked in `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-900-901-902-903`, branch
`workflow/bundle-900-901-902-903`. **Nothing committed.** Node v24.14.0. Every exit code below was read
with a bare `echo $?` directly on the command, never through a pipe.

**Verification tier: `regression-green`** plus a mutation-proven new guard. This work adds no behavioural
code; it propagates prose and extends one contract pin. The relevant suites were green before and after,
and the one new guard is proven armed against the actually-shipped defective surface.

---

## 1. All 14 surfaces carry the recipe

`TABLE_EXIT=0` — zero needle misses across 14 surfaces. The dot-dir paths are named **explicitly**
because `grep` on this box is ugrep and skips dot-directories; the table is computed in Node with
`String.split` on fixed literals, so no pattern semantics can confuse the result.

```
authoring templates/routing/finalize.skeleton.md                                 hash=1 verdictpass=1 record=1 tree=1 exit0=1 reasons=1
tracked   commands/kaola-workflow-finalize.md                                    hash=1 verdictpass=1 record=1 tree=1 exit0=1 scoped=2 reasons=1
tracked   plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md         hash=1 verdictpass=1 record=1 tree=1 exit0=1 scoped=2 reasons=1
tracked   plugins/kaola-workflow-gitlab/commands/kaola-workflow-finalize.md      hash=1 verdictpass=1 record=1 tree=1 exit0=1 scoped=2 reasons=1
tracked   plugins/kaola-workflow-gitlab/skills/kaola-workflow-finalize/SKILL.md  hash=1 verdictpass=1 record=1 tree=1 exit0=1 scoped=2 reasons=1
tracked   plugins/kaola-workflow-gitea/commands/kaola-workflow-finalize.md       hash=1 verdictpass=1 record=1 tree=1 exit0=1 scoped=2 reasons=1
tracked   plugins/kaola-workflow-gitea/skills/kaola-workflow-finalize/SKILL.md   hash=1 verdictpass=1 record=1 tree=1 exit0=1 scoped=2 reasons=1
dot-dir   .opencode/command/kaola-workflow-finalize.md                           hash=1 verdictpass=1 record=1 tree=1 exit0=1 scoped=2 reasons=1
dot-dir   .opencode-gitlab/command/kaola-workflow-finalize.md                    hash=1 verdictpass=1 record=1 tree=1 exit0=1 scoped=2 reasons=1
dot-dir   .opencode-gitea/command/kaola-workflow-finalize.md                     hash=1 verdictpass=1 record=1 tree=1 exit0=1 scoped=2 reasons=1
dot-dir   .kimi/skills/kaola-workflow-finalize/SKILL.md                          hash=1 verdictpass=1 record=1 tree=1 exit0=1 scoped=2 reasons=1
dot-dir   .kimi-gitlab/skills/kaola-workflow-finalize/SKILL.md                   hash=1 verdictpass=1 record=1 tree=1 exit0=1 scoped=2 reasons=1
dot-dir   .kimi-gitea/skills/kaola-workflow-finalize/SKILL.md                    hash=1 verdictpass=1 record=1 tree=1 exit0=1 scoped=2 reasons=1
prose     README.md                                                              hash=1 verdictpass=1 record=1 tree=1

surfaces: 14   needle misses: 0
```

Needles, all fixed literals:

| column | needle | why it is load-bearing |
|---|---|---|
| `hash` | `validated_candidate_hash` | the field the gate requires and all 13 shipped surfaces omitted |
| `verdictpass` | `verdict: pass` | the pre-existing pin's needle — proves I did not displace it |
| `record` | `validation-runner.js" record` | the invocable producer, verb attached to the script |
| `tree` | `from the working tree you validated` | measured failure mode 1 (a linked worktree and main hash differently) |
| `exit0` | `the exit code, carries whether` | measured failure mode 2 (exit 0 = recorded, not validated) |
| `scoped` | `closure-audit.js" --project {project}` | #903's acceptance: the scoped command where project metadata exists. **2 per surface** — the dry-run line and the commented `--execute` line |
| `reasons` | `clear everything in \`reasons\`` | #902's wording fix |

The skeleton row has no `scoped` cell **by construction, not by omission**: the skeleton reaches the
closure-audit command through `<!-- SPLICE:fz-closure-audit-run -->`, so its scoped invocation lives in
`slots.js`. Checked separately against the module's own export, all three forges, `SPLICE_EXIT=0`:

```
  github: --project {project} occurrences = 2 (dry-run line + --execute line)
  gitlab: --project {project} occurrences = 2 (dry-run line + --execute line)
  gitea:  --project {project} occurrences = 2 (dry-run line + --execute line)
```

`README.md` is the 14th surface and states the same rule in its own register, which is exactly why a
grep keyed to one phrasing undercounted it once already. It now carries the same
`from the working tree you validated` clause as the twelve shipped surfaces — one rule, one wording —
so a future sweep on that phrase finds all thirteen.

Table script: `<scratch>/surface-table.js` (scratch root
`/private/tmp/claude-501/-Users-ylpromax5-Workspace-Kaola-Workflow/037a4418-0c87-497c-95ca-200a8a6b607f/scratchpad/`).

---

## 2. Authoring points edited, and the regeneration commands

**Two authoring points. Never a rendered surface.**

| authoring point | change |
|---|---|
| `templates/routing/finalize.skeleton.md` Step 1 | the Consumer bullet now names all **three** required column-0 fields, and a new `On the consumer branch:` bash block carries the resolver SLOT plus the literal `record` invocation, followed by the tree-binding and exit-code prose |
| `templates/routing/finalize.skeleton.md` Step 10 | `clear everything it lists` → `clear everything in \`reasons\``, plus one sentence saying `checks` also carries state the transaction settles itself and a token there that `reasons` does not repeat is not the operator's to clear |
| `templates/routing/finalize.skeleton.md` closure-audit PIN | new prose: `--project` partitions rather than narrows; `current_project_clean` is the verdict for this run and is fail-closed; the exit code carries no verdict (0 with drift, 1 for a wrong invocation) |
| `templates/routing/slots.js` `fz-closure-audit-run` | both invocation lines now pass `--project {project}`, all three forges |

**No SPLICE was added for the recorder**, deliberately. `RENAMES` in `rename-table.js` is empty and
`kaola-workflow-validation-runner.js` is the same basename in all four trees (it is a
byte-identical group, not a forge-renamed port — verified by `ls` in the gitlab and gitea plugin
scripts dirs), so the invocation has no forge divergence to express. A splice would have stored the
same string three times, which is three places two forges can silently disagree. It is also in the
install manifest (`kaola-workflow-install-manifest.js:66`), so `$KAOLA_SCRIPTS/…` resolves on the
reader's runtime — the recipe names no command that will not resolve.

Regeneration, in the required order:

```
node scripts/generate-routing-surfaces.js --write        # rendered 18 surfaces        EXIT 0
node scripts/generate-routing-surfaces.js --check        # all 18 byte-match           EXIT 0
node scripts/sync-opencode-edition.js --forge=github --write   EXIT 0
node scripts/sync-opencode-edition.js --forge=gitlab --write   EXIT 0
node scripts/sync-opencode-edition.js --forge=gitea  --write   EXIT 0
node scripts/sync-kimi-edition.js     --forge=github --write   EXIT 0
node scripts/sync-kimi-edition.js     --forge=gitlab --write   EXIT 0
node scripts/sync-kimi-edition.js     --forge=gitea  --write   EXIT 0
```

`--write` materializes **one forge per invocation** (default `github`), so all six calls are required;
a bare `--write` would have left four of the six dot-dir trees stale. Each was then re-checked
individually — six `--check` runs, all `EXIT 0`.

Both sync trees are **gitignored and untracked** (`.gitignore:5,6,9,10`; `git ls-files` finds 0 tracked
files under them), so regenerating them adds nothing to the commit. The three `.kimi*` trees did not
exist in this worktree before my run and were created by the sync; that is the normal posture for a
generated tree, and it is why `test-kimi-edition.js`/`test-opencode-edition.js` skip an absent tree
loudly rather than failing.

---

## 3. Documentation

### `README.md` — one bullet, `:957-964`

The consumer half of the Validation bullet now names the producer and all three fields, and carries the
tree-binding clause verbatim from the surfaces.

**`README.md:1016` (the closure-audit script-table row) was deliberately left alone.** It describes
capability (dry-run default, `--execute` repairs safe local drift) and remains accurate; it is not an
invocation site, and the CLI contract lives in `docs/api.md`. Additive derivation: no observed failure
demands a second statement of the scoping flags there.

### `docs/api.md` — five regions

| region | change |
|---|---|
| `finalize --check` envelope | `authority` added to the example shape; a new paragraph on why `checks` and `reasons` answer different questions, naming `pending_mirror` as script-owned state alongside the long-standing `sync_required`, and restating that `archive_authority_missing` still lands in both; a 5-row table for the `authority` block (`main_root`, `linked_root`, `source`, `source_dir`, `dest_dir`) |
| Consumer arm | now names `kaola-workflow-validation-runner.js record` as the producer of all three fields |
| `kaola-workflow-validation-runner.js` | `record` added to the usage block; a new `#### record` subsection covering the shared-hash requirement, the tree binding, the exit-code split, the merge-never-clobber policy, and `other_candidate_roots` |
| Merge sink | a new "Gitignored archive evidence is force-added" block with a 3-row table for `archive_forced_paths` / `archive_missing_paths` / `archive_add_errors` (each naming **where** it appears: receipt, refusal envelope, or both), the new refusal, the unchanged whole-band case, the forge-neutrality of the three names, and `finalize_transaction.archive_ignored_evidence`; plus an `archive_commit` row in the `sink_incomplete` shapes table, placed at its real position in `SINK_STEPS` (between `stash_restore` and `push_main`) |
| Closure audit | six invocation forms replacing two; a 6-row contract table (fail-closed `current_project_clean`, skipped classes in both halves, exit 0 with drift, exit 1 for operator input only, `attribution`, whole-mirror rebuild under scoped `--execute`); and `archive_summary_citation_missing` added to the drift-class key table with its exclusion rule and its known false-positive mode |

**The durable record of the twice-spelled kernel command** landed in `docs/api.md`, at the end of the
new `record` subsection: the verb's name appears in the remediation hints for both
`final_validation_unbound` and `final_validation_stale`, so a rename has to change both in all four
byte-identical copies, and **nothing keeps the two spellings in step**. Recorded, **not built** — no
guard, per watch-list discipline; there is no observed failure yet.

`docs/api.md` is test-consumed (`SELF_HOST_TEST_CONSUMED`), so editing it re-stales a chain receipt.
That is expected and is why docs are written before the receipt run. It was not skipped.

### Every documented contract detail was measured against the real CLI, not transcribed

| probe | result |
|---|---|
| `record --verdict pass --command "make test"` (no `--project`) | **exit 2**, usage on stderr, nothing written |
| `record --project kw-probe-no-such-project --verdict pass --command "make test"` — the recipe's exact flag set | **exit 1**, `outcome: "inconclusive"`, `reasons: ["project_folder_missing"]`, `operator_hint` naming the path and telling the operator to record from the worktree; `ls` confirms no folder was created |
| `closure-audit.js --help` | **exit 0**, `usage:` on stdout |
| `closure-audit.js --project kw-probe-no-such-project` | **exit 1**, **stdout 0 bytes**, stderr naming both locations searched and suggesting `--issue` |

No write-path invocation was run against the live repository.

---

## 4. The new validator pin, and its mutation proof

`scripts/validate-workflow-contracts.js` (mirrored byte-identically to
`plugins/kaola-workflow/scripts/validate-workflow-contracts.js` — see §6). Three assertions added after
the two existing ones:

```js
assertIncludes('commands/kaola-workflow-finalize.md', 'validated_candidate_hash');
assertIncludes('commands/kaola-workflow-finalize.md', 'kaola-workflow-validation-runner.js" record');
assertIncludes('commands/kaola-workflow-finalize.md', '--project {project} --verdict pass --command');
```

The invocation needle is **split at the line continuation** because `assertIncludes` normalizes
whitespace but not the `\` itself: one needle pins the verb attached to the script, the other pins the
flags that make the record land bound.

**Mutation-proven in a scratch mirror**, never by editing and reverting a live file — reverting in this
worktree would have destroyed five sibling agents' uncommitted work. The mirror is
`git archive HEAD | tar -x` plus an overlay of only my 11 changed files
(`<scratch>/mut900/`), so the real worktree was untouched throughout.

| leg | mutation | exit | validator said |
|---|---|---|---|
| 0 | pristine mirror — **positive control** | **0** | `Workflow contract validation passed` |
| A | `validated_candidate_hash` removed from the shipped surface (occurrences 1 → 0) | **1** | `must include: validated_candidate_hash` |
| B | field kept, the whole `record` invocation replaced with a hand-write comment (1 → 0) | **1** | `must include: kaola-workflow-validation-runner.js" record` |
| C | script + verb kept, the flags line replaced with `--help` (1 → 0) | **1** | `must include: --project {project} --verdict pass --command` |
| D | pristine restored | **0** | passed |
| **E** | **the ACTUAL shipped v9.1.1 surface** (`git show HEAD:commands/kaola-workflow-finalize.md`) vs the **new** validator | **1** | `must include: validated_candidate_hash` |
| **E′** | the same shipped surface vs the **old** validator (`git show HEAD:scripts/validate-workflow-contracts.js`) | **0** | `Workflow contract validation passed` |
| F | both restored | **0** | passed |

Legs E and E′ are the ones that matter: the old pin was **green against the surface that carried the
defect**, and the new pin reds on it. Detection of this class goes from 0.0 to 1.0. Legs A–C prove each
of the three needles is independently armed, so no one of them is carrying the other two.

---

## 5. CHANGELOG entry

A new `## [Unreleased]` section (there was none; current version `9.1.1`), with `### Added` for #900 and
#903 and `### Fixed` for #901 and #902. 165 inserted lines. Register matched to the `9.1.1` / `9.1.0`
entries: long-form, leading with what a consumer can now do or what no longer silently loses evidence,
and stating what was measured rather than what was intended.

### Citation check — verified with the release verifier's own parser

Not with a regex of my own. `unreleasedSection()` was lifted out of the shipped bytes of
`scripts/kaola-workflow-release.js` and run over `CHANGELOG.md`, so what is reported is what the verifier
will see:

```
verifier-visible refs in [Unreleased]: [900,903,901,902]
unknown-reference risk: (none)
```

| carries `#` | why |
|---|---|
| `#900` `#901` `#902` `#903` | issues this release delivers — the set `--issues-closed` asserts |

| deliberately WITHOUT `#` | what it is |
|---|---|
| `648` | the origin of the two-field consumer recipe, when column-0 `verdict: pass` genuinely was the whole parsed requirement |
| `837` | the `--check` one-pass checklist and the worktree→main mirror step #902 converges with |
| `832` | the whole-band `skipped_gitignored` arm #901 preserves byte-for-byte |
| `700` | the `archiveAtHead` never-committed tree test the new per-path check is added *after*, not in place of |
| `520` | the four transaction journals that can never be force-added |
| `893` | the `archived_paths` derivation, unchanged and now naming the forced files |
| `676` | the byte verifier whose four `.cache` sidecar exemptions the disposal gate closes |

Every one of those is a real, closed, local issue — which is exactly the case that refuses
`changelog_unknown_reference` if hashed, because the verifier's known set is `--issues-closed` plus every
`#\d+` in commit messages since the last tag, not "issues that exist here". A background citation is
fixed by **removing** the `#`, never by injecting one. Other bare numbers in the section (`368`, `118`,
`436`, `000`) are measurements and a file mode, not issue citations, and carry no `#` either.

No CI/CD is mentioned anywhere in the entry or in any surface I touched.

---

## 6. One file I had to add to my write set, and why

`plugins/kaola-workflow/scripts/validate-workflow-contracts.js` — the **byte-lockstep mirror** of the
file the brief assigned me. `validate-workflow-contracts.js` is in `COMMON_SCRIPTS`
(`validate-script-sync.js`), so editing the canonical copy alone red two validators:

- `validate-kaola-workflow-contracts.js` → exit **1**,
  `plugins/kaola-workflow/scripts/validate-workflow-contracts.js must match scripts/validate-workflow-contracts.js`
- `validate-script-sync.js` → exit **1**, naming that one file and nothing else

Copied canonical → plugin (`cmp` exit 0). This is the same file's own contract, not a sibling's script;
no `scripts/kaola-workflow-*.js` was touched. Both validators are exit 0 after.

---

## 7. Suites — real exit codes

Run serially from the worktree (`pwd` confirmed `…/.kw/worktrees/bundle-900-901-902-903`); this suite set
is spawn-bound and concurrent runs give false reds. Every code from a bare `echo $?` on the command with
output redirected to a file — never `cmd | tail`, since `${PIPESTATUS[0]}` is broken in this zsh.

| suite | before | after |
|---|---|---|
| `generate-routing-surfaces.js --check` | **0** — all 18 byte-match | **0** — all 18 byte-match |
| `validate-workflow-contracts.js` | **0** | **0** |
| `test-route-reachability.js` | **0** — 323 assertions | **0** — 323 assertions |
| `test-opencode-edition.js` | **0** — 492 assertions, **3 trees ABSENT, not checked** | **0** — 492 assertions, **3 trees in parity** |
| `test-kimi-edition.js` | not run before | **0** — 507 assertions, **3 trees in parity** |
| `simulate-workflow-walkthrough.js` (**full scope**, 1/1 shard) | not run before my edits | **0** — `{"index":1,"total":1,"scenarios":184,"ran":184,"passed":184,"failed":0}`, 1958 spawns |
| `validate-kaola-workflow-contracts.js` | not run before | **1 → 0** (the plugin mirror, §6) |
| `validate-script-sync.js` | not run before | **1 → 0** — `OK: 15 common scripts, 27 byte-identical groups, … 6 forge export-superset families in sync` + `committed kernel parity: 4 Oracle Kernel copies identical at HEAD` |
| `test-validate-script-sync.js` | not run before | **0** — 59 assertions |
| `test-validation-allowband.js` | not run before | **0** — 17 assertions, 5 validator-referenced prose files all kept as CODE |
| `test-run-chains.js` | not run before | **0** — 238 assertions |

The `test-opencode-edition.js` before/after is a **strengthening, not a wobble**: at baseline all three
opencode trees were absent, so its drift check compared nothing and printed three skip lines. After the
syncs it verified all three. Same for kimi. That is the axis a "green" baseline could not have covered.

The required-block interiors survive verbatim — `test-route-reachability.js` T6 and
`test-opencode-edition.js` A16 both green, so `<!-- PIN: closure-audit -->`,
`after-the-fact drift detector` and
`If the sink reported that it did not complete, the step it names is where to resume` are all intact on
every finalize surface. My closure-audit prose was inserted **before** the sentence carrying the last two
so neither was reflowed.

The full-scope walkthrough is green **including** five sibling agents' concurrent uncommitted script
edits; it is not an isolation of my diff. My diff is prose, one contract pin and generated surfaces, and
the isolation evidence for the pin is §4's scratch mirror.

`npm test` / the four chains were **not** run: my diff touches `docs/api.md` and `README.md`, both
test-consumed, so a receipt is owed at finalize and one produced now would be stale the instant a sibling
lands. Chain selection belongs to the producer.

---

## 8. Files changed (13 — exactly my write set)

```
 CHANGELOG.md                                                          | 165 +
 README.md                                                             |   8 +-
 docs/api.md                                                           | 114 +-
 templates/routing/finalize.skeleton.md                                |  35 +-
 templates/routing/slots.js                                            |   2 +-
 commands/kaola-workflow-finalize.md                                   |  40 +-
 plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md        |  40 +-
 plugins/kaola-workflow-gitlab/commands/kaola-workflow-finalize.md     |  40 +-
 plugins/kaola-workflow-gitlab/skills/kaola-workflow-finalize/SKILL.md |  40 +-
 plugins/kaola-workflow-gitea/commands/kaola-workflow-finalize.md      |  40 +-
 plugins/kaola-workflow-gitea/skills/kaola-workflow-finalize/SKILL.md  |  40 +-
 scripts/validate-workflow-contracts.js                                |  11 +
 plugins/kaola-workflow/scripts/validate-workflow-contracts.js         |  11 +
 13 files changed, 531 insertions(+), 55 deletions(-)
```

Plus the 6 untracked, gitignored dot-dir edition surfaces (regenerated, not hand-edited).

**No test file was written or edited.** No `scripts/kaola-workflow-*.js` was touched. No rendered surface
was hand-edited. Nothing was committed.

---

## 9. What I could not verify, and decisions worth a second reader

- **The four chains / `npm test`.** Not run, for the reason in §7. The receipt is owed at finalize and
  belongs to the producer.
- **Per-edition coverage sentences in the CHANGELOG were written against a moving tree.** When I first
  measured, the **gitea** `claim.js` port carried neither #901's claim half nor #902 (`pending_mirror=0`,
  `predictFinalizeAuthority=0`, `ignoredArchiveEvidence=0`) while gitlab did. I deliberately wrote the
  entry with no edition claim, re-measured after the sibling port agent landed, and only then added
  "lands in all four editions" to both. Final measurement: all four `claim.js` copies carry
  `pending_mirror=5`, `predictFinalizeAuthority=2`, `ignoredArchiveEvidence=3`, `archiveRelFromRoot=3`;
  all four `sink-merge.js` copies carry the three new fields; all four `closure-audit.js` copies carry
  `current_project_clean` and `archive_summary_citation_missing`; all four `validation-runner.js` copies
  carry `recordFinalValidation`. **If any of those regresses before the tag, the CHANGELOG's two "all
  four editions" sentences must be corrected.** That is the one claim in my output whose truth depends on
  another agent's in-flight work.
- **The dot-dir surfaces are not committed and cannot be.** They are gitignored generated trees, so their
  correctness is only ever as good as running the two sync scripts. Nothing in a commit records that I
  ran them; the two edition suites are what re-establishes it.
- **`README.md:1016` left unscoped** (§3) — a judgement, not an oversight. A reader of that table will
  not learn that scoping exists; they will learn it from `docs/api.md` or from the finalize surface they
  are actually following.
- **I did not add the `authority` block to the finalize surfaces**, only to `docs/api.md`. The observed
  failure was a false obligation in `reasons`, and that is what the wording now fixes; naming a
  five-field diagnostic block in an agent-facing surface is not something an observed failure demanded.
- **`archive_summary_citation_missing` documented with its false-positive mode stated.** Its own
  implementer called this the part least willing to be called settled (~25% false positives, 3 genuine
  losses out of 4 flagged). I documented the measured behaviour and said outright that it is a prompt to
  adjudicate rather than a verdict, which is the honest register — but whether that noise floor belongs
  in the terminal sweep is a values call and is not mine.
- **A residue finding I did not touch, flagged by #903's implementer and still open**: the two forge
  ports' `archiveRequiredContent` still carries the retired Node-Ledger mechanism (`plan_hash`
  probing, a `workflow-plan.md` demand, a lazy `require` of the long-gone
  `listRecordedNodeEvidence`). It is inert dead code, it is **not** among the divergences
  `docs/api.md` records as deliberate, and it is outside my brief. Repeated here so it is not lost.

---

# ADDENDUM — second-reproduction evidence folded into the #900 and #902 entries

Later dispatch. New field evidence arrived on #900 and #902: both are **second independent
reproductions in the Kimi edition** (the original incidents were Codex), from one consumer run of
vrpai-cli issue 1042 on 2026-08-01. Each names a concrete harm sharper than anything the entries
already carried. `CHANGELOG.md` is the only file touched. Still uncommitted.

## What was added

Three insertions, all inside existing bullets in the register already established — no new sections,
no incident-report expansion.

| entry | where | what |
|---|---|---|
| #900 | after the fixture measurement, before "Two things the verb has to get right" | the second reproduction, that two editions failing on the same wording beats either incident alone, and the harm: **the binding was stamped after the finalize transaction had already archived the project folder, so the record a later reader would trust was edited post-hoc.** Closes on why an invocable producer matters because it exists *before* the transaction, not because it saves typing |
| #902 | after the first paragraph, before "`--check` now predicts" | the second reproduction with `archive_authority_missing` the **only** unmet precondition, and the operator hand-copying the project folder main→worktree with `cp -R` before re-running — unnecessary, the transaction self-heals. The harm stated as the cost: **a disagreeing preflight trains operators to hand-copy project folders, exactly the class of manual mirror repair 837 moved inside the transaction so nobody would have to do it by hand again** |
| #902 | after "Any one of those failing leaves the original resolution and its refusal untouched." | that the authority is deliberately **not** relocated to main (`dest_dir` stays the tree execution reads), and that the field evidence is what makes that the right call rather than the lesser of two — predicting the mirror is precisely what makes the hand-copy unnecessary, where naming main as the authority would have been the same disagreement inverted |

## Citation check — same release-verifier parser, re-run

`unreleasedSection()` lifted again out of the shipped bytes of `scripts/kaola-workflow-release.js`, so
what is reported is what the verifier will see, not a regex of mine:

```
verifier-visible refs in [Unreleased]: [900,903,901,902]
would refuse changelog_unknown_reference on: (none)
"vrpai-cli issue 1042" occurrences: 2
"#1042" occurrences (must be 0): 0
"financial-agent" occurrences: 0
CITATION_EXIT=0
```

**The hashed set is still exactly `#900 #901 #902 #903`.** `vrpai-cli` is another forge, so its issue
number is written **bare** at both sites — a hashed cross-forge citation would refuse
`changelog_unknown_reference`, because the verifier's known set is `--issues-closed` plus every `#\d+`
in commit messages since the last tag, not "issues that exist somewhere". A background citation is
fixed by **removing** the `#`, never by injecting one. The check asserts the absence of `#1042`
explicitly rather than only the presence of the bare form, so it cannot pass on a hashed citation that
also happens to appear unhashed elsewhere. `financial-agent` is not cited: I had no evidence tied to
it and do not cite what I cannot ground.

## Not reverted

`CHANGELOG.md:86` — the team lead changed #901's headline from "and report success" to
"**and reports success anyway**" after I finished. Left exactly as they wrote it; all three of my
insertions are in the #900 and #902 bullets and none touches that line.

## Suites re-run after the addendum — real exit codes, bare `echo $?`

| suite | exit |
|---|---|
| `generate-routing-surfaces.js --check` | **0** — all 18 byte-match (unchanged; no authoring surface was touched) |
| `validate-workflow-contracts.js` | **0** |
| `test-release.js` | **0** — 247 assertions (the CHANGELOG-focused suite) |
| the 14-surface table | **0** — 0 needle misses, unchanged |
| `simulate-workflow-walkthrough.js` (**full scope**) | **0** — `{"scenarios":197,"ran":197,"passed":197,"failed":0}`, 2052 spawns |
| `validate-script-sync.js` | **0** |
| `validate-kaola-workflow-contracts.js` | **1 → 0**, see below |

The walkthrough is now **197 scenarios, not 184** — the test author has landed 13 new ones since my
first run. All 197 pass, so this is a strictly stronger green than the earlier one, over the bundle's
new coverage as well as the old.

**One transient red worth recording so nobody re-diagnoses it.** `validate-kaola-workflow-contracts.js`
exited **1** on
`canonical validation runner and all three installed copies must remain byte-identical`. That was a
**torn read of a sibling agent's mid-write file**, not a finding: `md5` immediately afterwards shows all
four `kaola-workflow-validation-runner.js` copies identical (`8a781aeda1ad244125f8073964b1ca82`), the
file's mtime was 21:32:20 against my last script edit at 20:38:37, and I never touched that file in
either dispatch. Re-run once the write settled: **exit 0**. The lesson is the ordinary one about
running a cross-copy byte check while another agent is copying — read the mtimes before believing the
verdict.

## Files changed by the addendum

`CHANGELOG.md` only (`+21` lines across three insertions). No surface, no skeleton, no doc, no script,
no test file. Nothing committed.

---

# ADDENDUM 2 — the closure-audit parity fix: one doc sharpening, one CHANGELOG paragraph

Later dispatch, after the owner ruled that both forge closure-audit ports drop the retired
`plan_hash` → `workflow-plan.md` demand canonical had already deleted. Two files touched:
`docs/api.md` and `CHANGELOG.md`. Still uncommitted.

## The claim was grounded before it was written

I did not take the parity fix on report. `archiveRequiredContent` now reads, **identically in all four
copies**, `workflow-state.md` or nothing:

```js
function archiveRequiredContent(dir) {
  let state;
  try { state = fs.readFileSync(path.join(dir, 'workflow-state.md'), 'utf8'); } catch (_) { state = null; }
  if (state === null) return ['workflow-state.md'];
  return [];
}
```

| copy | `plan_hash` | `workflow-plan` | `listRecordedNodeEvidence` | `isSafeName` |
|---|---|---|---|---|
| `scripts/kaola-workflow-closure-audit.js` | 0 | 0 | 0 | 3 |
| `plugins/kaola-workflow/scripts/kaola-workflow-closure-audit.js` | 0 | 0 | 0 | 3 |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-closure-audit.js` | 0 | 0 | 0 | 3 |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-closure-audit.js` | 0 | 0 | 0 | 3 |

So "the required set is exactly one file" and "`--project` is validated against the safe-folder-name
rule" are both measured, not relayed. This also **closes the residue finding I recorded in §9** — the
ports' retired Node-Ledger mechanism, which #903's implementer flagged and left, is gone from both.

## 1. `docs/api.md` — the `archive_content_incomplete` row, sharpened

The implementer's suggested wording taken as-is, because it is right and it makes the row
self-explaining:

> **before** — An archived run whose folder is missing a required artifact.
> **after** — An archived run whose folder is missing its `workflow-state.md` identity anchor — the only
> unconditionally required artifact.

"Identity anchor" is what makes the neighbouring `attribution` row legible without cross-reference: the
artifact this class reports missing is itself the record that would carry an issue number, which is
exactly why the two archive classes are attributable by folder name alone.

`docs/api.md` is test-consumed, so this re-stales a chain receipt. Expected, and not skipped for that
reason — there is no receipt yet and the chains run after me.

## 2. `docs/api.md:990` — no edit, by design

The sentence "**GitLab** ships `kaola-gitlab-workflow-closure-audit.js` with the same contract and JSON
shape" **was false before this change and is true now**. The doc is therefore correct as written and
needs no words; what was worth recording is that a fix restored a claim the documentation was already
making. That went in the CHANGELOG, below.

## 3. `docs/api.md:960` — the optional name-validation clause: **declined**

The exit-1 row already publishes "a missing or **malformed** flag value", and an unsafe folder name is a
malformed value, so rejecting it conforms to the contract as published. No observed failure shows anyone
misreading that row, the rule is now stated once in the CHANGELOG, and the standing project rule is that
there is already too much here. Silence is an answer; I spent no words on it. Recorded so the decision
is visible rather than looking like an oversight.

## 4. `CHANGELOG.md` — one paragraph appended to the #903 bullet

It fit; the entry stays readable. #903 is the closure-audit issue, so the ports' agreement with
canonical belongs in its bullet rather than in a bullet of its own, and one closing paragraph is the
same shape 9.1.0 used for the corrections that fell out of its fix. Nine lines carrying two facts:

- the measured disagreement — on an archive carrying `plan_hash` with no plan file, canonical reported
  `archive_content_incomplete: []` while **both ports** reported the folder missing `workflow-plan.md`
  — and that `docs/api.md` claimed the same contract and JSON shape while that was untrue on that input;
- the scope escape: `--project` validated against the same safe-folder-name rule the rest of the script
  already used, so `--project ../../outside` exits 1 with empty stdout instead of resolving a scope
  outside the repository at exit 0.

`issue-777` from the measurement is **not** cited: it is a fixture project name, not a real issue, and
naming it in the changelog would read as a citation of an issue that does not exist here.

## Citation check — same release-verifier parser, third run

Hashed set unchanged, and every background / cross-forge number verified bare **at every site**, not
merely present in a bare form somewhere:

```
verifier-visible refs in [Unreleased]: [900,903,901,902]
would refuse changelog_unknown_reference on: (none)
  1042: bare=2 hashed=0
  648:  bare=1 hashed=0
  832:  bare=3 hashed=0
  700:  bare=1 hashed=0
  520:  bare=1 hashed=0
  893:  bare=1 hashed=0
  676:  bare=1 hashed=0
  837:  bare=4 hashed=0
hashed background/cross-forge citations: (none)
CITATION_EXIT=0
```

The check now counts `hashed` per number rather than asserting the absence of one literal, so a single
hashed site among several bare ones cannot hide. `financial-agent` remains uncited — no evidence tied
to it, and I do not cite what I cannot ground.

## An integrity check I added because the file moved under me

The Edit tool reported `CHANGELOG.md` had been modified on disk since I last read it. My edit applied
cleanly, but rather than assume, I re-asserted that every earlier edit survived — including the team
lead's, which I must not revert:

```
  ok  lead edit :86 (do not revert)  (x1)
  ok  addendum 1 (#900 second repro)  (x1)
  ok  addendum 1 harm (post-hoc archive edit)  (x1)
  ok  addendum 2 (#902 second repro)  (x1)
  ok  addendum 2 harm (trains hand-copying)  (x1)
  ok  addendum 3 (not relocated to main)  (x1)
  ok  NEW: parity claim restored  (x1)
  ok  NEW: scope escape closed  (x1)
INTEGRITY_EXIT=0
```

All four bullet headlines are unchanged and the `[9.1.1]` section is untouched.

## Suites re-run — real exit codes, bare `echo $?`

| suite | exit |
|---|---|
| `generate-routing-surfaces.js --check` | **0** — all 18 byte-match (no authoring surface touched) |
| `validate-workflow-contracts.js` | **0** |
| `test-release.js` | **0** — 247 assertions |
| `test-validation-allowband.js` | **0** — 17 assertions, 5 validator-referenced prose files all kept as CODE |
| `test-run-chains.js` | **0** — the other `docs/api.md` consumer |
| the 14-surface table | **0** — 0 needle misses |
| `simulate-workflow-walkthrough.js` (**full scope**) | **0** — `{"scenarios":197,"ran":197,"passed":197,"failed":0}`, 2052 spawns |

197 scenarios again, all green, run while a `tdd-guide` agent is editing
`simulate-workflow-walkthrough.js` and both `test-git{lab,ea}-workflow-scripts.js`. I stayed out of all
three. Nothing red this round, so no attribution question arose.

## Files changed by addendum 2

`docs/api.md` (one table row) and `CHANGELOG.md` (`+9` lines in the #903 bullet). No surface, no
skeleton, no script, no test file. Nothing committed.

---

# ADDENDUM 3 — `project_unresolved`: the scoped verdict is stricter than the prose promised

Later dispatch. A reviewer found that a mistyped `--project` combined with any `--issue` answered
`current_project_clean: true` — a false clean verdict. The scoped envelope now carries
`scope.project_unresolved` (omit-when-false) and the verdict reads `false` when the named project does
not resolve, at exit **0**; exit 1 stays reserved for an unresolvable `--project` with **no** `--issue`.
Three surfaces understated that. `docs/api.md`, `templates/routing/finalize.skeleton.md` and
`CHANGELOG.md` touched, plus the 7 surfaces the skeleton renders and the 6 dot-dir trees. Uncommitted.

## READ THIS FIRST — I misread the tree, and the correction is the lesson

My first measurement of the fix reported it **absent**: `project_unresolved=0` in all four
`closure-audit.js` copies, the canonical file 382 lines with no `resolveScope` and no
`current_project_clean`, `git status` clean for it, and its mtime predating the whole bundle. Read at
face value that says #903's implementation had been reverted out of the worktree, and I was one step
from reporting a lost-work incident.

**It was wrong, and it was my error.** Those commands used *relative* paths and executed with a stale
cwd of the **main root** — left over from a `cd` in a much earlier compound command in this session —
so I was measuring `main` at v9.1.1, where none of this exists. Re-measured with absolute paths:

| root | branch | `closure-audit.js` lines | `project_unresolved` | `resolveScope` |
|---|---|---|---|---|
| `.kw/worktrees/bundle-900-901-902-903` | `workflow/bundle-900-901-902-903` | **756** | **5** | **2** |
| `/Users/ylpromax5/Workspace/Kaola-Workflow` | `main` | 382 | 0 | 0 |

The fix is present, in all four copies (canonical + github plugin 756 lines, the two forge ports 755),
each with `project_unresolved=5` and `isSafeName=3`.

The tell I should have caught immediately: the *same* invocation that "proved" the flag absent
nonetheless accepted `--project` and printed the scoped error message. Two measurements contradicted
each other and I kept going instead of stopping on the contradiction. This is the trap the run record
already names — the worktree/main folder split — and `pwd` in a *later* call showing the worktree is not
evidence about an *earlier* one, because the tool's cwd persists across calls. **Every command in this
addendum uses absolute paths, and the regeneration and suite runs each print `pwd`.**

Recording it because a false "the implementation is gone" report costs more than the measurement did.

## The contract, measured live rather than relayed

`driftIsClean` (canonical `:594-596`) is where the verdict is decided — the scope check precedes the
per-class loop, so it cannot be reached past a clean drift set:

```js
function driftIsClean(drift, scope) {
  if (scope && scope.project_unresolved) return false;
```

| leg | exit | `scope` | `current_project_clean` |
|---|---|---|---|
| **the reviewer's case** — `--project kw-no-such-project-xyz --issue 900` | **0** | `{...,"state_file":null,"project_unresolved":true}` | **false** |
| `--project kw-no-such-project-xyz` (no `--issue`) | **1** | — (stdout **0 bytes**) | — |
| `--issue 900` alone — nothing unresolved | 0 | `{"project":null,"issue_numbers":[900],"state_file":null}` | `true` |

Row 2 confirms the exit-code distinction is intact, and row 3 confirms `project_unresolved` is genuinely
**omitted** rather than emitted `false` — `hasOwnProperty` on the parsed envelope returns `false`.

## What was written

Proportionate: one clause per site, folded into sentences that already existed. No new sections.

| site | change |
|---|---|
| `templates/routing/finalize.skeleton.md` (the **authoring** surface) | after the fail-closed sentence: a name that resolves to no record is that rule applied to the scope itself, so the verdict is `false` and `scope.project_unresolved` says why; the exit-0 clause now reads "drift **and an unresolved name** included", and the exit-1 clause is qualified to "a mistyped project name **with no `--issue` beside it**" |
| `docs/api.md` `current_project_clean` row | extended with the unresolved-name case, stated as the same fail-closed rule and explicitly independent of what the classes say about `--issue` numbers passed beside it |
| `docs/api.md` — one **new** row | `scope.project_unresolved` (omitted unless `true`), including why it exists: it makes a `null` `state_file` legible — the name was given and found nothing, rather than never given |
| `CHANGELOG.md` #903 bullet | the unresolved case folded into the existing fail-closed sentence rather than added as a fourth "contract detail", so the paragraph's own "Three contract details" count stays honest; the exit-0 and exit-1 sentences sharpened to match |

**`docs/api.md`'s exit-1 row needed no edit** — it already said "a `--project` resolving to no
`workflow-state.md` anywhere **with no `--issue` given**", so it was already the strict form. Checked
rather than assumed.

## Pipeline — the one established, absolute paths, `pwd` printed

```
pwd → /Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-900-901-902-903
generate-routing-surfaces.js --write   → rendered 18 surfaces                EXIT 0
sync-opencode-edition.js --forge={github,gitlab,gitea} --write               EXIT 0 / 0 / 0
sync-kimi-edition.js     --forge={github,gitlab,gitea} --write               EXIT 0 / 0 / 0
generate-routing-surfaces.js --check   → all 18 surfaces byte-match          EXIT 0
```

**Surface count from `--check`: 18.** No rendered surface was hand-edited.

## All 13 recipe surfaces carry the new clause

Same fixed-literal table, three needles added (`unresolved` = ``` `scope.project_unresolved` says why ```,
`exit0drift` = `drift and an unresolved name included`, `exit1qual` = ``` with no `--issue` beside it still is ```).
Every one of the 13 reads `unresolved=1 exit0drift=1 exit1qual=1`, alongside the seven needles from the
earlier dispatches:

```
surfaces: 14   needle misses: 0
TABLE_EXIT=0
```

`README.md` is exempt from the three new needles by design: it does not state the audit's verdict
contract at all, so there is nothing there to understate.

## Citation check — fourth run, same parser, still nothing to report

```
verifier-visible refs in [Unreleased]: [900,903,901,902]
would refuse changelog_unknown_reference on: (none)
  1042: bare=2 hashed=0     832: bare=3 hashed=0     893: bare=1 hashed=0
  648:  bare=1 hashed=0     700: bare=1 hashed=0     676: bare=1 hashed=0
  837:  bare=4 hashed=0     520: bare=1 hashed=0
hashed background/cross-forge citations: (none)
CITATION_EXIT=0
```

Hashed set still exactly `#900 #901 #902 #903`. Nothing in this addendum added a citation.

## Suites — real exit codes, bare `echo $?`

| suite | exit |
|---|---|
| `generate-routing-surfaces.js --check` | **0** — **18 surfaces** byte-match |
| `test-route-reachability.js` | **0** — 323 assertions (T6's PIN + both interior sentences intact) |
| `test-opencode-edition.js` | **0** — 492 assertions, 3 trees in parity |
| `test-kimi-edition.js` | **0** — 507 assertions, 3 trees in parity |
| `test-release.js` | **0** — 247 assertions |
| the 14-surface table | **0** — 0 needle misses |
| `simulate-workflow-walkthrough.js` (**full scope**) | **0** — `{"scenarios":198,"ran":198,"passed":198,"failed":0}`, 2079 spawns |
| `validate-workflow-contracts.js` | **1 → 0**, not mine — see below |

198 scenarios now (184 → 197 → 198 across my three runs) as the test author lands pins; all pass.

### The transient red, and a real fact worth acting on

`validate-workflow-contracts.js` exited **1** on `CLAUDE.md must stay below the 200-line target`. Not
mine: `CLAUDE.md` is not in my write set, `git status` shows it unmodified, and it was being edited live
(mtime `2026-08-01 23:35:43`) when my run read it. Re-run once it settled: **exit 0**.

**The fact worth acting on:** the assertion is `split(/\r?\n/).length < 200` and `CLAUDE.md` now counts
**199**. That is **one line of headroom**, and the file is under active edit — the next paragraph added
to it reds the contract validator, and therefore every chain, for a reason that has nothing to do with
the change that triggers it. Flagging, not fixing: `CLAUDE.md` is owner-owned and outside my write set.

## Files changed by addendum 3

`templates/routing/finalize.skeleton.md`, `docs/api.md`, `CHANGELOG.md`, plus the 6 tracked rendered
surfaces the skeleton regenerated and the 6 untracked dot-dir edition surfaces. No script, no test file,
no hand-edited rendered surface. Nothing committed.

---

# ADDENDUM 4 — the sync is typed in both directions, and one convention section registered

Two items. `docs/api.md` and `CHANGELOG.md` touched; **no skeleton edit, so no regeneration was owed**
and no rendered surface changed this round. Uncommitted.

## 1. `docs/api.md` — the sync sentence, now both directions

Grounded before writing. The main→worktree copy at canonical `claim.js:3245-3255` is now wrapped, and
returns the reason its sibling twenty lines above already used:

```js
  try {
    mergeCopyDir(srcDir, destDir, FINALIZE_MIRROR_DEST_OWNED);
  } catch (e) {
    if (e instanceof TypeError || e instanceof ReferenceError) throw e;
    return { refused: true, inner_reason: 'mirror_sync_failed', detail: … };
  }
```

Present in all four `claim.js` copies (`mirror_sync_failed` ×10, `mergeCopyDir` ×9 in each). The
`TypeError`/`ReferenceError` rethrow keeps the export-drift class fenced, unchanged.

> **before** — …and it owns the worktree→main project-folder sync itself.
> **after** — …and it owns the project-folder sync itself, in **both** directions — worktree→main and
> main→worktree. Either direction failing is typed the same way, `mirror_sync_failed`, and fails closed
> before anything downstream has run, so a sync the script cannot perform is a refusal the operator can
> read rather than an untyped crash.

**Neither the crash nor the permission scenario is named**, per instruction: the row states the contract
(both directions, one reason, fail-closed, readable) and nothing about what exposed it. The incident
detail went to `CHANGELOG.md` instead.

## 2. `CHANGELOG.md` — two additions, and one is a judgement I am flagging

**(a) A new `### Documentation` subsection, one bullet**, kept clearly outside the four issue entries —
the `[Unreleased]` headings are now exactly `### Added | ### Fixed | ### Documentation`. It names
`docs/conventions.md`'s new `## Specify the result; the method is the agent's (#900–#903)` section
(verified present at `docs/conventions.md:804`), says it is the register of record and is deliberately
not restated, and states that nothing behavioural, no surface, no guard and no command contract changed.
Its content is **not** paraphrased.

**(b) A clause I was not asked for, added on my own judgement.** The brief said the sync incident
"belongs in `CHANGELOG.md` if anywhere", leaving it to me. I added six lines closing the #902 bullet:
the transaction owns the mirror in both directions but only worktree→main had a failure path, an
unwritable destination made the main→worktree copy throw straight out of the transaction leaving the
operator a stack line and no typed envelope, both now report the same `mirror_sync_failed` and fail
closed with the worktree as found — and, explicitly, *"that is not a new stop; it is the stop that
already existed, made readable."* That last clause is load-bearing, because the same bullet asserts two
paragraphs earlier that **no refusal was added anywhere**, and a reader meeting a newly-typed refusal
without it would reasonably think the two sentences contradict each other.

Why I added it rather than leaving it out: an untyped crash becoming a typed refusal is user-visible, and
the project rule is that user-visible changes are recorded under `[Unreleased]`. Omitting it would leave
exactly the gap between shipped behaviour and documented behaviour that this whole bundle exists to
close. Flagging it because it is scope I chose, not scope I was handed — **cut it if you disagree**; it
is one paragraph and it removes cleanly.

`CLAUDE.md` untouched and no pointer added to it, per instruction — it sits at its cap and evicting a
rule is an owner decision. (For the record, the assertion is `< 200` on `split(/\r?\n/).length` and the
file counts **199**, so the headroom I flagged in addendum 3 is one line, unchanged.)

## Citation check — fifth run, same parser

```
verifier-visible refs in [Unreleased]: [900,903,901,902]
would refuse changelog_unknown_reference on: (none)
  1042: bare=2 hashed=0     832: bare=3 hashed=0     893: bare=1 hashed=0
  648:  bare=1 hashed=0     700: bare=1 hashed=0     676: bare=1 hashed=0
  837:  bare=4 hashed=0     520: bare=1 hashed=0
hashed background/cross-forge citations: (none)
section headings: ### Added | ### Fixed | ### Documentation
CITATION_EXIT=0
```

Hashed set still exactly `#900 #901 #902 #903`. Note the one new citation risk this round and why it is
safe: I quoted the conventions heading **verbatim**, which carries `(#900–#903)`. The verifier's
`/#(\d+)/g` reads that as `#900` and `#903` — both in the delivered set — so `refs` is unchanged. Had
that heading cited a background issue, quoting it verbatim would have introduced a refusal, which is
worth knowing before anyone quotes another heading.

## Suites — real exit codes, bare `echo $?`, absolute paths, `pwd` printed

| suite | exit |
|---|---|
| `generate-routing-surfaces.js --check` | **0** — **18 surfaces** byte-match (no skeleton edit this round, so this is a no-drift confirmation) |
| `validate-workflow-contracts.js` | **0** |
| `validate-kaola-workflow-contracts.js` | **0** |
| `test-release.js` | **0** — 247 assertions |
| `test-validation-allowband.js` | **0** |
| `test-run-chains.js` | **0** |
| the 14-surface table | **0** — 0 needle misses |
| `simulate-workflow-walkthrough.js` (**full scope**) | **1 → 0**, not mine — see below |

### The walkthrough red, attributed and then cleared

First run: **exit 1** at `simulate-workflow-walkthrough.js:10267`,
`#429 crash-resume: second --sink run must exit 0`. Attributed three ways before treating it as anyone's:

1. **The failing assertion is in a test file** I must not and did not touch.
2. **The byte-lockstep pair was torn mid-write.** `cmp scripts/kaola-workflow-sink-merge.js
   plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js` → **differ at line 1387**, and
   `validate-script-sync.js` → exit **1** naming exactly `kaola-workflow-claim.js` and
   `kaola-workflow-sink-merge.js`. mtimes: canonical sink-merge `23:43:31`, its mirror `23:22:35`,
   `claim.js` `23:42:55` — i.e. an implementer writing *while my run was in flight*. My own files:
   `docs/api.md` `23:40:02`, `CHANGELOG.md` `23:40:37`, skeleton `23:34:08`.
3. **The scenario cannot reach my diff.** Grepping the scenario body for `docs/api`, `CHANGELOG`,
   `README`, `templates/routing`, `commands/` and `SKILL` returns nothing — it shells out to
   `sink-merge.js`, which is not mine.

Rather than report a red I could attribute but had not cleared, I waited on the condition itself — an
until-loop on `cmp` of both lockstep pairs — which **converged after ~190s**, then re-verified
`validate-script-sync.js` **exit 0** and re-ran the suite: **exit 0, 198/198, 2079 spawns**. Same
scenario count and same spawn census as addendum 3's green, so nothing regressed and nothing was skipped.

## Files changed by addendum 4

`docs/api.md` (one sentence) and `CHANGELOG.md` (one `### Documentation` bullet plus the six-line #902
clause). No skeleton, no surface, no script, no test file. Nothing committed.

---

# ADDENDUM 5 — the record lands in the main-resident run folder (final prose item)

One sentence into the consumer recipe, then the usual regeneration. `templates/routing/finalize.skeleton.md`
plus the 6 tracked rendered surfaces and the 6 dot-dir edition surfaces. Uncommitted.

## Grounded first — the two resolutions really are separate

Read out of the shipped runner, not relayed. The hash and the destination are resolved by different
calls against different things:

| what | where | resolves to |
|---|---|---|
| the hashed tree | `:1298` `resolveCandidateRoot(schema)`, hashed at `:1331` | the tree the invoking shell is in |
| the record's destination | `:1313` `resolveRecordFolder(candidateRoot, project, schema)` → `:1339` `recordPath` | the run folder the gate reads from, with a `mainResident` flag |

The runner's own comment at `:1337-1338` states the consequence outright — *"when the folder is
main-resident the write is not even in the hashed tree"* — which is exactly why the two can differ
without either being wrong.

**I did not measure this live, deliberately.** The only way to exercise the main-resident lane against
this repository is to write `kaola-workflow/bundle-900-901-902-903/.cache/final-validation.md` in the
real main root, which would plant a genuine binding artifact in the live run folder that finalize
consumes. The contract is read from the shipped code path above; a fixture reproduction was not worth
the risk of leaving a real record behind, and the implementer already measured it.

## What was written — one sentence, and where it went

> The record itself lands in the run folder the gate reads it from — on a worktree run that is the main
> checkout's rather than this tree's, because the gate takes the record from the authority folder and
> hashes the tree its own shell is in — so `record_path` is where to look for the file.

**Placement is a judgement I am flagging.** The brief said "the `**Consumer**` block". I put it in the
paragraph immediately after the invocation rather than in the bullet itself, for two reasons: the harm
happens *after* the operator runs the command (they look in the worktree and find nothing), and the
bullet names the path `kaola-workflow/{project}/.cache/final-validation.md` without a root — qualifying
it there with "the main checkout's" would be **wrong on an in-place run**, where main *is* the tree. The
paragraph it joined is the one that already discusses which tree is which, so the pair now reads as one
thought. Move it if you prefer the bullet.

**Two things deliberately not written**, both per instruction and both already covered by the verb:

- no suggestion to hand-create the run folder in the worktree — and no warning against it either. The
  runner's own `operator_hint` (`:1361-1368`) already says *"do not create the run folder here by hand"*
  in precisely the case where it matters, and one rule has one wording;
- no troubleshooting note and no alternative path. There is one supported invocation and it works.

Nothing in the recipe was corrected: this is an addition. "Run it from the working tree you validated"
was already right.

## Pipeline — `pwd` printed, absolute paths

```
pwd → /Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-900-901-902-903
generate-routing-surfaces.js --write   → rendered 18 surfaces           EXIT 0
sync-opencode-edition.js --forge={github,gitlab,gitea} --write          EXIT 0 / 0 / 0
sync-kimi-edition.js     --forge={github,gitlab,gitea} --write          EXIT 0 / 0 / 0
generate-routing-surfaces.js --check   → all 18 surfaces byte-match     EXIT 0
```

**Surface count from `--check`: 18.** No rendered surface hand-edited.

All 13 recipe surfaces carry the new sentence — needle
``` so `record_path` is where to look for the file ``` added to the table, `recordpath=1` on every one,
alongside the ten needles from the earlier dispatches: `surfaces: 14   needle misses: 0`.

## The three earlier items, enumerated rather than assumed

Verified by literal-needle assertion at each item's real home, `ENUMERATION_EXIT=0`:

```
  IN  ITEM 1  api.md:211 both-directions sync            (docs/api.md, 2 needles)
  IN  ITEM 2a project_unresolved -> docs/api.md          (docs/api.md, 2 needles)
  IN  ITEM 2b project_unresolved -> skeleton             (finalize.skeleton.md, 3 needles)
  IN  ITEM 2c project_unresolved -> CHANGELOG            (CHANGELOG.md, 1 needle)
  IN  ITEM 3  conventions-section changelog bullet       (CHANGELOG.md, 3 needles)
  IN  ITEM 4  NEW record_path sentence -> skeleton       (finalize.skeleton.md, 1 needle)
```

Item 2 is checked at **three** homes rather than one, because the understatement spanned all three and
a single-site check would have passed while two sites still understated the rule.

## Citation check — sixth run, same parser

```
verifier-visible refs in [Unreleased]: [900,903,901,902]
would refuse changelog_unknown_reference on: (none)
  1042: bare=2 hashed=0     832: bare=3 hashed=0     893: bare=1 hashed=0
  648:  bare=1 hashed=0     700: bare=1 hashed=0     676: bare=1 hashed=0
  837:  bare=4 hashed=0     520: bare=1 hashed=0
hashed background/cross-forge citations: (none)
section headings: ### Added | ### Fixed | ### Documentation
CITATION_EXIT=0
```

Hashed set still exactly `#900 #901 #902 #903`. This addendum touched no citation and added none —
`CHANGELOG.md` was not edited at all.

## Suites — real exit codes, bare `echo $?`

| suite | exit |
|---|---|
| `generate-routing-surfaces.js --check` | **0** — **18 surfaces** byte-match |
| `validate-workflow-contracts.js` | **0** |
| `test-route-reachability.js` | **0** — 323 assertions (T6 PIN + both interior sentences intact) |
| `test-opencode-edition.js` | **0** — 492 assertions, 3 trees in parity |
| `test-kimi-edition.js` | **0** — 507 assertions, 3 trees in parity |
| `test-release.js` | **0** — 247 assertions |
| `validate-script-sync.js` | **0** — no torn lockstep pair this round |
| `simulate-workflow-walkthrough.js` (**full scope**) | **0** — `{"scenarios":198,"ran":198,"passed":198,"failed":0}`, 2079 spawns |

Green first time, no transient. Same 198 scenarios and 2079 spawns as the previous two greens.

## Files changed by addendum 5

`templates/routing/finalize.skeleton.md` (one sentence) plus the 6 tracked rendered surfaces it
regenerated and the 6 untracked dot-dir edition surfaces. No `docs/`, no `CHANGELOG.md`, no script, no
test file, no hand-edited rendered surface. Nothing committed.

---

# CLOSING STATE — what this role delivered across five dispatches

| tracked file | role |
|---|---|
| `templates/routing/finalize.skeleton.md` | the authoring surface — the consumer recipe, the `--check` wording, the scoped-audit prose |
| `templates/routing/slots.js` | `fz-closure-audit-run`, scoped for all three forges |
| `commands/kaola-workflow-finalize.md` + 5 more | the 6 tracked rendered surfaces, generated only |
| `README.md` | the consumer validation bullet |
| `docs/api.md` | `--check` envelope + `authority`, the `record` verb, the sink's three fields, the closure-audit contract, the both-directions sync |
| `CHANGELOG.md` | `[Unreleased]`: `### Added` (#900, #903), `### Fixed` (#901, #902), `### Documentation` |
| `scripts/validate-workflow-contracts.js` + its plugin mirror | the mutation-proven three-needle pin |

Plus the 6 untracked, gitignored dot-dir edition surfaces, regenerated and never hand-edited.
**No test file was written or edited at any point. No `scripts/kaola-workflow-*.js` was touched.
Nothing was committed.**

The one claim in this record whose truth depends on work I do not own remains the CHANGELOG's two
"lands in all four editions" sentences (§9). Everything else is measured here.
