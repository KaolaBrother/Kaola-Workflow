# m-docs-path — a `docs/…` path on a shipped surface must resolve for its reader

**Task.** Add a check to `scripts/validate-workflow-contracts.js` that fails when a consumer-facing
surface points at a `docs/…` path that will not resolve for its reader. Forced by #892: a deleted
`docs/mission-list.md` left a dead pointer on twelve installed `next` surfaces across four runtimes,
found by a person reading prose, with nothing in the repo comparing a cited path against what the
reader would have.

**Verification tier: `build-green`.** The deliverable is a validator, and a validator's own
executable check is its run: clean-tree exit 0, plus the mutation runs below. No behavioural unit
test was authored (I am the implementer and hold no test custody — see NOT DELIVERED).

---

## SCOPE DECISION

**The two reader contexts.**

- **(i) Ships to a consumer repo.** The 18 rows of `GENERATED_SURFACES` — 3 topics x {command,
  skill} x 3 forges — are installed into a consumer's runtime. Their reader has no copy of this
  repository's `docs/` tree, so a `docs/…` path is suspect *no matter what exists here*.
- **(ii) Read in this repository.** `CLAUDE.md`, `README.md`, `docs/**`, `scripts/**`,
  `docs/decisions/**`. Here `docs/` exists; a path is fine iff the file is on disk. **Not scanned.**

Conflating the two is the whole risk, and I did not have to guess where the line falls, because the
`docs/…` occurrences on the shipped surfaces are not pointers into this repository at all — every one
of them is part of the doc scaffold `/workflow-init` **creates in the reader's own repo**.

**So the allowed set is not a taste call and is not hand-typed.** It is parsed out of the scaffold
tree in `templates/routing/init.skeleton.md`:

```text
docs/
  README.md
  architecture.md
  api.md
  conventions.md
  decisions/
```

Allowed == created, mechanically. Add a scaffold doc and the allowance follows it; cite anything else
and the check reds. This reproduces, as a rule, the judgement #892 made by hand when it dropped
`docs/workflow-state-contract.md` from the consumer scaffold's Documentation Map while keeping those
five generic entries — that entry named a file only this repository has; these five the consumer will
have.

**INCLUDED (21 files).** The 18 `GENERATED_SURFACES` rows, sourced from the generator's own registry
(reuse, not a new inventory — the same registry `kaola-workflow-prose-census.js` consumes), plus the
three `templates/routing/*.skeleton.md` they render from, so a bad pointer is red **at the source**
and not only after a regenerate. That mirrors the two existing skeleton sweeps in this file
(`next.skeleton.md` for `Backlog Inventory` / `What You May Read`, and the KW-CLAUDE-TEMPLATE region
block, which reads the rendered surface **and** the skeleton for exactly this reason).

**EXCLUDED, each with its reason:**

- `agents/*.md` — measured, not assumed. Four sites carry `docs/…`:
  `agents/doc-updater.md:3,40,69` (`docs/CODEMAPS/`) and `:105` (`docs/GUIDES/*.md`), plus
  `agents/knowledge-lookup.md:3` (`docs/API/framework/standards/expertise`, a slash-joined word list,
  not a path). The doc-updater ones are **conditional conventions about the reader's own tree** —
  "If either exists, regenerate them using the existing tooling" — not instructions to go read a file
  in this repository. Folding them in would mean four exemption entries for four non-defects, which
  is the "parking spot" failure the `VENDOR_NOUN_EXEMPT` comment in this same file warns against.
  Flagging for the lead: if you want agent profiles in scope, that is a scope extension and those
  four sites are the whole cost.
- The consumer `CLAUDE.md` / `AGENTS.md` scaffolds — **not excluded, covered**. There is no separate
  scaffold file under `templates/`; both live *inside* `templates/routing/init.skeleton.md` (the
  `KW-CLAUDE-TEMPLATE` region and the AGENTS.md redirect block) and render into the six init
  surfaces. All six, and the skeleton, are in the scanned set. Proven by mutation M3 below, which
  reds on the Documentation Map bullet list inside that region on all six surfaces + the skeleton.
- `.opencode/` and `.kimi/` — **absent by construction**, not skipped. Named explicitly (`grep` here
  is ugrep and skips dot-directories, so a bare sweep would have said "clean" without looking):
  `ls -d .claude .opencode .kimi` returns *No such file or directory* for all three in the worktree.
  They are gitignored build products with zero tracked files, and they render *from these same
  registry rows*, so guarding the source is guarding them. Nothing is unmeasured here.
- `plugins/*/agents/*.toml`, `hooks/` — swept, zero `docs/…` occurrences.

---

## IMPLEMENTATION

`scripts/validate-workflow-contracts.js:1028–1123` — one block, appended after the
`VENDOR_MODEL_NOUN_BAN` block whose idiom it follows (universal scan, derived surface set, one
message). 96 added lines, no other line of the file touched.

Byte-mirrored to `plugins/kaola-workflow/scripts/validate-workflow-contracts.js`. **That is not a
second file, it is the same artifact**: `scripts/validate-script-sync.js` (a step in the claude
chain, line 54 allowlist) requires the two byte-identical, they are byte-identical at HEAD, and
`validate-script-sync.js` exited **1** until I copied it. No chain invokes the plugin copy.

**How it reports every site at once** (`:1108–1122`) — matches the `checkContractVersionPins` idiom
from #889: accumulate into a `dead[]` array across all 21 surfaces, then a single
`assert(dead.length === 0, …)` whose message carries the count, the derived allowed set, and one
`path:line: match` per offending site. No first-failure abort — a twelve-surface propagation must
print as twelve lines, not as twelve run-read-patch rounds, and the count is what tells you it
propagated at all.

**Three sub-parts:**

1. `DOCS_PATH` + two independent reference signals (`:1057–1067`). A match counts as a pointer if it
   `looksLikeFile` (extension or trailing `/`) **OR** `isInlineCode` (preceded by a backtick). Either
   alone leaves a hole — see COVERAGE PROOF, where the extension-only form let a mutation through.
2. The scaffold parse (`:1069–1094`). Finds each `docs/` line at column 0 and takes its indented
   children; the skeleton carries the tree twice (once per `surface_type` region) and both are
   unioned. Guarded by `assert(scaffoldDocs.size >= 3, …)` so a reflow that breaks the parse says
   *the parse broke* rather than redding all 63 legitimate sites with a misleading message.
3. The scan (`:1096–1122`), over `GENERATED_SURFACES` paths + the deduped skeleton set, with an
   `exists()` assert per surface so a missing file cannot silently shrink the scanned set.

**Not vacuous — instrumented on the clean tree:** 21 surfaces scanned, **63** `docs/` tokens treated
as pointers (all 63 in the 5-entry derived scaffold set), **7** prose tokens correctly skipped (all
`docs/roadmap`, from "which docs/roadmap files were created"). Derived scaffold set, printed:
`docs/README.md, docs/api.md, docs/architecture.md, docs/conventions.md, docs/decisions/`.

---

## CLEAN RUN

Worktree `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-896-897-898`. Exit codes
captured from `$?` directly, never through a pipe.

**BEFORE** (baseline, my change not yet applied):

```
node scripts/validate-workflow-contracts.js                       -> "Workflow contract validation passed"  EXIT=0
KAOLA_WORKFLOW_OFFLINE=1 node scripts/validate-workflow-contracts.js                                          EXIT=0
```

**AFTER:**

```
node scripts/validate-workflow-contracts.js            -> "Workflow contract validation passed"  EXIT=0
KAOLA_WORKFLOW_OFFLINE=1  (same)                                                                  EXIT=0
node scripts/validate-script-sync.js                                                              EXIT=0
node scripts/test-validate-script-sync.js                                                         EXIT=0
node scripts/generate-routing-surfaces.js --check   -> "all 18 surfaces byte-match the skeleton"   EXIT=0
node scripts/test-generate-routing-surfaces.js                                                    EXIT=0
node scripts/test-route-reachability.js                                                           EXIT=0
node scripts/validate-kaola-workflow-contracts.js                                                 EXIT=0
node scripts/validate-vendored-agents.js                                                          EXIT=0
node scripts/measure-validator-duplication.js                                                     EXIT=0
node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js            EXIT=0
node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js              EXIT=0
```

**The three walkthrough scenarios that exercise this validator, run as direct equivalents** (the
walkthrough file itself is mid-edit by sibling agents, so running it would measure their WIP, not my
change — see NOT DELIVERED):

```
testContractValidatorOfflineSkip     -> KAOLA_WORKFLOW_OFFLINE=1 ... EXIT=0        (must be 0)
testContractValidatorReflowTolerant  -> require() exports: norm,assertIncludes,assertConcept,assertBefore
                                        (my block sits after the `if (require.main !== module)` early
                                         return at :128, so module-mode never executes it)
testContractValidatorMissingTag      -> git stubbed to exit 1 on PATH ... EXIT=1   (must be non-zero)
```

---

## MUTATION PROOF — ARMED

All mutation work in a scratch mirror at
`/private/tmp/claude-501/-Users-ylpromax5-Workspace-Kaola-Workflow/176fc27c-8e46-48f3-80d7-313c6ebcdc4b/scratchpad/mirror2`
(worktree copied, `.git` removed). **No `git checkout --` was ever run in the worktree** — sibling
agents hold uncommitted work there. Mirror baseline before each mutation: **EXIT=0**.

**M1 — the exact #892 dead pointer, restored from git history** (`git log -S` on
`templates/routing/next.skeleton.md` recovered the deleted sentence), injected into the **skeleton**
and propagated by `generate-routing-surfaces.js --write`:

```diff
--- a/templates/routing/next.skeleton.md
+++ b/templates/routing/next.skeleton.md
@@ -234,0 +235,4 @@
+The canonical statement of the format — the four fields, the
+three write moments, and how to resume from it — is `docs/mission-list.md`; read it there rather
+than reconstruct it from memory.
+
```

Result — **EXIT=1**, all seven sites in one message:

```
Error: CONSUMER_DOCS_PATH — 7 site(s) name a `docs/…` path that will not resolve for the reader of an
installed surface. A consumer repo has only the doc tree /workflow-init creates there
(docs/README.md, docs/api.md, docs/architecture.md, docs/conventions.md, docs/decisions/); anything
else exists in this repository alone. Carry the content on the surface, or point at something the
reader has:
  commands/workflow-next.md:167: docs/mission-list.md
  plugins/kaola-workflow-gitlab/commands/workflow-next.md:167: docs/mission-list.md
  plugins/kaola-workflow-gitea/commands/workflow-next.md:167: docs/mission-list.md
  plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md:243: docs/mission-list.md
  plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md:243: docs/mission-list.md
  plugins/kaola-workflow-gitea/skills/kaola-workflow-next/SKILL.md:243: docs/mission-list.md
  templates/routing/next.skeleton.md:236: docs/mission-list.md
```

That is the #892 class reproduced and caught: the six rendered surfaces **and** the skeleton, named
together, exit 1. Mirror restored -> EXIT=0.

---

## COVERAGE PROOF

The scan is **universal over the declared set**, not an enumerated blocklist: every `docs/…` token on
every one of the 21 surfaces is tested, and only the *allowance* is a set — itself derived, not typed.
The declared set is the point to attack, so I mutated inside it, at its edge, and outside it.

| # | mutation | site | expected | **result** |
|---|---|---|---|---|
| M1 | `docs/mission-list.md`, backticked, via skeleton + regen | `next` topic, all 6 + skeleton | RED | **EXIT=1**, 7 sites |
| M2 | `docs/finalize-contract.md`, backticked, one rendered file | `finalize` topic, `commands/kaola-workflow-finalize.md:21` | RED | **EXIT=1**, 1 site |
| M3 | `docs/decisions/0017-the-mission-list.md` inside the KW-CLAUDE-TEMPLATE region | `init` topic, all 6 + skeleton | RED | **EXIT=1**, 7 sites |
| M4 | `docs/finalize-contract`, backticked, **no extension** | `commands/kaola-workflow-finalize.md:21` | RED | **EXIT=1**, 1 site |
| M5 | `docs/finalize-contract`, **unbackticked, no extension** | same | — | **EXIT=0 — NOT CAUGHT** |
| M6 | `docs/no-such-file.md` on 4 out-of-scope files | `agents/doc-updater.md`, `agents/implementer.md`, `README.md`, `docs/api.md` | not caught | **EXIT=0 on all four**, `CONSUMER_DOCS_PATH` fired 0 times |

**M2 proves the set is registry-wide, not `next`-shaped.** M1 lands on the topic the observed failure
touched; M2 lands on a different topic and a single rendered file, and reds. So coverage follows
`GENERATED_SURFACES`, not the one surface I was thinking about.

**M3 is the important edge, and it is a genuine hole a naive rule would have had.**
`docs/decisions/` **is** in the allowed set. A prefix-based membership test would have let
`docs/decisions/0017-the-mission-list.md` through — and that is exactly the repoint #892 performed,
so the near-miss is real, not hypothetical. Membership is exact-string, so the directory is allowed
(init creates it) while a specific ADR file inside it reds (init does not create that). Correct: a
consumer has an empty `docs/decisions/`, not our ADRs.

**M4 found a real coverage hole and I closed it mid-task, honestly.** My first implementation
required an extension or a trailing `/`. `docs/finalize-contract` has neither and slipped —
**EXIT=0**. I widened the predicate to two independent signals (`looksLikeFile` **OR**
`isInlineCode`), re-ran every mutation above against the widened matcher, and re-confirmed the clean
tree (63 pointers matched, 7 prose tokens skipped, EXIT=0). Every row in the table is the **post-**
widening result.

**M5 is the limit that remains, stated rather than hidden.** A reference that is *both* unbackticked
*and* extension-less is not caught. It is indistinguishable from prose by any rule that keeps
`docs/roadmap` ("which docs/roadmap files were created") green, and I chose the false-negative over
the false-positive. Recorded in the code comment at `:1065–1067`. Every real occurrence of this class
in the repo's history, #892 included, was backticked.

**M6 is the honest boundary.** Four files outside the declared set take a dead pointer and the check
stays silent. `agents/*.md` and `README.md` are excluded by the scope decision above; `docs/api.md`
is context (ii) and correctly untouched. Note one measurement subtlety: mutating `CLAUDE.md` **does**
exit 1, but that is the pre-existing `CLAUDE.md must stay below the 200-line target` assert firing at
199+1 lines, **not** my check — verified by reading the error text (`Error: CLAUDE.md must stay below
the 200-line target`), not by the exit code. I nearly recorded that as coverage I do not have.

---

## NOT DELIVERED AND WHY

1. **No test file.** I am the implementer and hold no test custody. The check is a validator
   assertion that runs as step 1 of the claude chain, and it is mutation-proven armed above — the
   same evidentiary standard the `VENDOR_MODEL_NOUN_BAN` and `PROVENANCE_BAN` blocks beside it carry,
   neither of which has a dedicated test. **My judgement: no test file is needed.** If the lead
   disagrees, the piece worth pinning is the scaffold parse (`scaffoldDocs`), because it is the only
   part with a parse that could silently return a wrong set — dispatch `tdd-guide`; I will not write it.
2. **The full walkthrough was not run.** `scripts/simulate-workflow-walkthrough.js` is being edited
   concurrently by sibling agents in this worktree (it shows `M` with +81 lines of their WIP), so a
   run measures their in-progress state, not my change, in either direction. Instead I ran the three
   walkthrough scenarios that actually touch this validator as direct equivalents — all three hold
   (see CLEAN RUN). Someone should run the walkthrough at full scope once the worktree settles;
   that is a bundle-level step, not something I can produce a trustworthy signal for from here.
3. **`agents/*.md` left out of scope** — reasoned above, with the four affected sites named so the
   lead can overrule cheaply.
4. **No `CHANGELOG.md` entry.** Not my file; another agent owns the changelog draft.
5. **Nothing committed**, per instructions. Changes are left in the worktree.

## Files changed

- `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-896-897-898/scripts/validate-workflow-contracts.js` (+96)
- `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-896-897-898/plugins/kaola-workflow/scripts/validate-workflow-contracts.js` (+96, mandated byte mirror of the above)

`package.json` was **not** touched. No surface, skeleton, or test file was touched.
