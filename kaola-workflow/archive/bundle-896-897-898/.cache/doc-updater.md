# Documentation checklist — bundle-896-897-898 (worktree at 6eed9801)

Scope: the 13 changed files in this run. Verified against source in
`/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-896-897-898/`.

---

## GAPS FOUND AND FIXED

**One edit, one file: `docs/api.md`.**

`docs/api.md:554-561` — the `sink_incomplete` refusal-shapes table. It announced itself as
"discriminated by `step`", and its `finalize` row described **only** the pre-existing lossy-archive
refusal (`missing` names them). The #899 refusal emits the **same** `step: 'finalize'` with a
different cause and a different payload, so after this run the table's stated discriminator no longer
discriminates: a consumer routing on `step` would read the row and expect `missing`, which the new
shape never carries.

Replaced the single `finalize` row with two rows keyed on `archive_refusal`, and amended the lead-in
to name the second discriminator. Field names and values transcribed from source:

| documented value | producer (verified) |
|---|---|
| `archive_refusal: "archive_incomplete"` + `missing` + `mismatched` | `scripts/kaola-workflow-sink-merge.js:1933-1953` (`receipt.archive_refusal = archiveResult.reason \|\| 'archive_incomplete'`; the only producer of `archive_incomplete: true` is `scripts/kaola-workflow-claim.js:2496`, which carries no `reason`, so the value is always the literal `archive_incomplete`) |
| `archive_refusal: "archive_exception"` | `scripts/kaola-workflow-sink-merge.js:1998` — the sink's own catch, after the `TypeError`/`ReferenceError` re-throw at `:1992` |
| `archive_refusal: "archive_forced_refusal"` | `scripts/kaola-workflow-claim.js:2405-2407` — the `KAOLA_WORKFLOW_FORCE_ARCHIVE_REFUSAL=1` test seam, reached by RETURN not by throw |
| `archive_refusal: "archive_not_performed"` | `scripts/kaola-workflow-sink-merge.js:1966` — the sink's own fallback when the return carries no `reason` |

`mismatched` was previously named **nowhere** in `docs/api.md` (grep: zero hits) despite riding the
envelope at `:1943`; it is now documented on the row it belongs to. That half is a pre-existing gap
in the row I was already rewriting, not something this run introduced.

**Validation run after the edit** (both api.md-reading validators, from the worktree):

- `KAOLA_WORKFLOW_OFFLINE=1 node scripts/validate-workflow-contracts.js` → `Workflow contract validation passed`, exit 0
- `KAOLA_WORKFLOW_OFFLINE=1 node scripts/validate-kaola-workflow-contracts.js` → `Kaola-Workflow Codex contract validation passed`

The pins those two hold on `docs/api.md` are the closure-contract concept block
(`validate-workflow-contracts.js:374`, `validate-kaola-workflow-contracts.js:191`) and the
forge-parity negative assertions (`:389-392`); my edit touches none of them.
`test-validation-allowband.js:110` and `test-run-chains.js:1451` reference the api.md **path**, never
its content.

### RECEIPT CONSEQUENCE — read this before deciding to keep the edit

`docs/api.md` is **code-visible**, not bookkeeping. It is listed in `SELF_HOST_TEST_CONSUMED`
(`scripts/kaola-workflow-adaptive-schema.js:958-964`), and `testConsumes` is checked *before*
`isBookkeepingPath` in `isValidationInvisible` (`:1002-1009`), so the `^docs/` inert rule does not
reach it. Measured, not inferred:

```
docs/api.md              validation-invisible = false
docs/architecture.md     validation-invisible = true
docs/conventions.md      validation-invisible = true
README.md                validation-invisible = false
CHANGELOG.md             validation-invisible = false
docs/README.md           validation-invisible = true
```

`computeCodeTreeHash` (`:1088-1107`) snapshots the **working tree**, so this uncommitted edit changes
the hash and the four-chain receipt bound to 6eed9801 will read `chains_stale` at finalize
(`:1326-1331`). Keeping the fix therefore costs a commit plus a chain re-run. That trade is yours:
the gap is real and in the machine-readable envelope contract, but if you judge the re-run too
expensive for this run, reverting `docs/api.md` and filing the row as a follow-up is a coherent call.
Nothing else I touched has this cost — I made no other edit.

---

## VERIFIED-ALREADY-CORRECT (checked, left alone)

Every claim in your `docs/api.md` edit was checked against source. All of them hold:

- **`{result: 'refuse', reason: 'sink_incomplete', step: 'finalize', archive_refusal}` at exit 1** —
  `:2009-2021`. `sinkEmit(payload, 1)` sets `process.exitCode = 1` (`:98-102`). Correct.
- **`archived === true` / `skipped === 'source-missing'` as the only two success reports** — matches
  `archiveProjectDir`'s full return surface in `scripts/kaola-workflow-claim.js`: `:2402`
  `{skipped:'source-missing'}`, `:2406` `{archived:false, reason:'archive_forced_refusal'}`, `:2496`
  `{archived:false, archive_incomplete:true, missing, mismatched, dest}`, `:2565`/`:2576`
  `{archived:true,...}`. There is no sixth shape. Correct.
- **"The stop happens before the step is marked done"** — the refusal returns at `:2022`;
  `stepDone('finalize')` is at `:2033`. Correct.
- **"Nothing is merged, pushed or closed on that path"** — `SINK_STEPS` (`:1046`) is
  `preflight, push_upstream, merge, finalize, stash_restore, archive_commit, push_main, closure`;
  `push_main` and `closure` are both downstream of `finalize`. Correct. (The merge itself is
  *upstream* — it has already run locally at that point; your api.md wording does not claim
  otherwise, and the source detail string says "Nothing was pushed to <defBranch>", which is exact.)
- **"not keyed on `receipt.archive_dest` being unset"** — `:2011` was `if (archiveResult &&
  archiveResult.dest)` and is now `if (!archiveFailure && archiveResult && archiveResult.dest)`; the
  source-missing return genuinely carries no `dest` (`claim.js:2402`). Correct.
- **`--sink` returns before the legacy precondition block** — `:2560-2571` routes to
  `runSinkTransaction` and returns; the legacy preconditions begin at `:2624`. Correct.
- **KEEP = `assertCleanWorktree`, `assertBranchPushedToUpstream`, `assertWorktreeClean`; CONVERTED =
  `assertNoLiveWorkflowFolder`, `assertBranchHasNonWorkflowChanges`** — matches the source comment at
  `:2617-2623` and the code beneath it exactly.
- **`run_not_finalized` → `result:'report'`, `status:'not_merged'`, exit 1** — `:2629-2637`. Correct.
- **`no_implementation_changes` → same envelope shape, plus `workflow_only_files`** — `:2644-2652`.
  Correct.
- **"`assertBranchHasNonWorkflowChanges` additionally skipped entirely when
  `KAOLA_WORKFLOW_OFFLINE=1`"** — `:2640` wraps it in `if (!OFFLINE)`. Correct, and easy to get wrong
  since `assertBranchPushedToUpstream` is offline-gated on the separate line `:2639`.
- **"Skipped when the mainline is unresolvable — it cannot judge, so it does not block"** — `:439`
  returns null on a missing base, `:445` on a failed diff. Correct.
- **Branch-tip probe `git cat-file -e {branch}:{path}`, not `HEAD:`** — `:324-328`, with the #346
  rationale in the comment above it. Correct.
- **"only `worktree_dirty` runs on `--sink`"** — `sinkPreflight:1341` is the sole guard call on that
  path. Correct *as scoped to the four listed guards*; see the one caveat under ERRORS below.

**Edition parity of the fix** — checked, sound. `plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js`
is byte-identical to `scripts/` (`diff -q` clean). All four copies carry 4 `#899` markers and 4
`archive_refusal` sites; gitea's emitted envelope at `:1808-1815` matches the GitHub wording. The
`sink_incomplete` count differs (11 GitHub / 10 gitlab / 10 gitea) purely because the ports collapse
some `sinkEmit` calls onto one line and carry one fewer prose comment — every refusal site is present
in all three. All three editions ship `kaola-workflow-closure-contract.js`, and all three
`*-claim.js` carry `archive_forced_refusal` and `archive_exception` once each.

**`CHANGELOG.md`** — seven `[Unreleased] ### Changed` entries present and matching the diff. No gap.

---

## ERRORS FOUND IN MY LEAD'S EDITS

**None material.** Every field name, exit code and envelope key is right. Two notes, neither an error:

1. **"of the four below only `worktree_dirty` runs on `--sink`" is true for the four named guards,
   but a reader may over-read it.** `sinkPreflight` also runs a foreign-dirt scan of the main root
   (`:1348-1400+`, three buckets: roadmap-source auto-stash, project-duplicate removal, foreign-dirt
   refusal), which covers roughly what `assertCleanWorktree` covers on the legacy path. So `--sink`
   is not unguarded on main-root cleanliness — it reaches the same fact by a different mechanism.
   Your sentence is literally accurate; I flag it only because "only one of four" invites the wrong
   inference. Not worth an edit given the receipt cost.

2. **`archive_refusal` is not new** — the pre-existing lossy-archive refusal at `:1934` already wrote
   it to the receipt and the envelope. Your bullet reads as though the field arrives with #899. It
   does not; what arrives is a second set of *values* for it. The two-row table above records that,
   so the bullet needs no change.

---

## A REAL FINDING, NOT A DOC GAP — the sink hand-rolls an existing shared predicate

`docs/api.md:640-645` documents a **Fail-closed archive result boundary**:

> The shared `archiveSucceeded(result)` predicate returns true only for `{ archived: true }` or the
> idempotent retry result `{ skipped: "source-missing" }`. Finalize, release/discard, and
> merged/closed PR/MR watch callers must pass this post-call predicate before roadmap regeneration or
> removal, remote issue or label disposition, worktree/branch/claim cleanup, terminal receipt
> stamping, or success output.

That predicate exists and is exported: `scripts/kaola-workflow-closure-contract.js:130-134`

```js
function archiveSucceeded(result) {
  return !!result && (result.archived === true || result.skipped === 'source-missing');
}
```

Four callers in `kaola-workflow-claim.js` already use it (`:3752`, `:4296`, `:5213`, `:5305`). The
#899 fix implements the **semantically identical** predicate inline instead
(`sink-merge.js:1962-1963`: `archiveHappened` / `nothingToArchive`), and the sink requires
`closure-contract.js` nowhere (grep: zero hits). All three editions ship the module under the same
unported filename, so a `require` would port cleanly.

Two things follow, and both are your call, not mine:

- **Reuse.** `CLAUDE.md` says "Reuse before adding: extend, don't duplicate." The sink is now a fifth
  enforcer of a documented shared boundary with a private twin — the exact drift shape that made
  `archiveSucceeded` shared in the first place. A one-line `require` + `!archiveSucceeded(archiveResult)`
  would collapse it.
- **Docking.** Whichever way that goes, `docs/api.md:640-645` enumerates the predicate's mandatory
  callers and the sink's finalize step is not among them. If the sink keeps its inline twin, that
  sentence should say the sink applies the same boundary independently; if it adopts the predicate,
  the sink joins the caller list.

I did not touch `scripts/` — implementation is not mine to change, and either resolution costs the
same chain re-run as the api.md edit, so it is cheapest to decide both together.

---

## NO-IMPACT REASONS (per checklist item)

**1. `README.md` — no gap. Your belief confirmed.**
Nothing in this run changes install, the overview, or the command surface. Specifically:
- The command surface is unchanged — no script gained or lost a flag, subcommand or exit code.
- `README.md:971-986` ("The sink reports; the orchestrator owns the outcome. The sink does not refuse
  and does not decide.") enumerates **no** `sink_incomplete` shapes and never has. The sink has
  refused `sink_incomplete` since long before this run — `push_upstream`, `archive_commit`,
  `push_main`, `closure`, `keep_open_verify`, and the pre-existing lossy-archive `finalize` are all
  at HEAD~1. #899 adds one more member of an already-unenumerated class, so no README sentence
  becomes false that was true before. (The blanket "does not refuse" was already imprecise about
  operation-level refusals; `docs/api.md:599-604` is the surface that draws that distinction
  correctly, and it is untouched by this run.)
- `README.md:968` ("The archive still fails loudly if it would lose a file. That is an operation
  refusing to destroy data") describes the *finalize transaction's* archive, not the sink's step, and
  remains exactly true.
- `README.md:1028` (`test-finalize-door.js`: "...a bad release candidate still refuses") already
  covers the T5j addition — T5j pins that #888's deletion of the release-prep carry-over stays
  deleted, which is squarely "a bad release candidate still refuses". No new capability to describe.
- `README.md:1017`'s sink-merge script-table entry does not mention archiving at all. That is a
  pre-existing omission, identical before and after this run, and widening it is a rewrite rather
  than a docking — reported, not done.

**2. `docs/architecture.md` — no structural change. Your belief confirmed.**
No new module, no moved boundary, no changed data flow: the fix adds a check inside an existing step
of an existing transaction. One observation, reported not fixed:
- `docs/architecture.md:208-224`'s merge-sink diagram orders the flow `… → Push the default branch →
  Close the issue → Archive the folder, clean up branch and worktree, dispose the journals`. The
  actual `SINK_STEPS` order (`sink-merge.js:1046`) archives at `finalize`, **before** `archive_commit`,
  `push_main` and `closure`. The diagram's ordering was already at odds with the code; this run makes
  the ordering load-bearing, because the whole point of #899 is that a failed archive gates
  `push_main` and `closure`. A reader of the diagram would infer the opposite ordering.
  I left it alone deliberately: `docs/architecture.md` is validation-invisible so the edit is free of
  receipt cost, but rewriting a conceptual diagram is a judgment call about whether it is meant to be
  literal (it also lists "Run the validation chains", which is not a `SINK_STEPS` entry), and that
  call is yours. `docs/architecture.md:231` carries the same blanket "It does not refuse and it does
  not decide" as the README, with the same pre-existing imprecision.

**3. `docs/api.md` — one gap, fixed above; everything else verified correct.**

**4. `docs/conventions.md` — `CONSUMER_DOCS_PATH` does not belong there. Reported, not added.**
My reasoning, so you can overrule it:
- The *rule* the check enforces already has exactly one wording, in `CLAUDE.md`: "Consumer-facing
  artifacts (`CLAUDE.md`, `AGENTS.md`) name no vendor, no model, and no command that will not resolve
  on the reader's runtime." Restating it in `conventions.md` would give one rule two wordings, which
  the project's own "One rule, one wording" principle rejects.
- The *derivation* — allowed set parsed from the init skeleton's scaffold tree, so allowed == created
  mechanically; 18 generated surfaces plus 3 skeletons; `agents/*.md` deliberately unscanned;
  `.opencode`/`.kimi` absent by construction — is already carried in full in the 40-line header
  comment at `scripts/validate-workflow-contracts.js:1028-1054`, next to the code it explains.
- The failure mode a doc would prevent is a skeleton author hitting an unexplained red. That does not
  happen: the assertion message (`:1116-1121`) prints the count, lists every allowed `docs/…` entry,
  and names each offending `file:line: path`.
- `docs/conventions.md:282-317` (§ Aiming a guard) is the nearest home, and `CONSUMER_DOCS_PATH` is an
  *application* of its "a guard reads what ships, not what was authored" corollary — it scans the
  shipped surfaces **and** the skeletons — not a new corollary. Adding it would be a mechanism
  recorded for a failure class the existing rule already covers, against "Derive additively".
If you disagree, the cheapest home is one bullet under § Aiming a guard, and that file is
validation-invisible so it costs no chain re-run.

**5. Sweep for `docs/` prose contradicting the new sink behaviour — one hit, reported at item 2
(the architecture diagram's step ordering).** Everything else checked and clean:
- `docs/workflow-state-contract.md:120-140` (Archive Destination, `deferred_to_sink`,
  `removeWorktree` rescue) — describes *where* the archive lands and who commits it, not whether a
  failure is detected. Untouched by the fix.
- `docs/conventions.md:516-560` (§ Release) — already documents the #888 deletion of the release-prep
  carry-over correctly at `:549-554`. T5j pins exactly that; no stale prose.
- `docs/README.md` — index only; the entry it carries for ADR 0017 restates the same "sink reports"
  framing as README/architecture. No new claim to correct.
- `docs/decisions/` and `docs/investigations/` — history by declaration
  (`docs/README.md`: "Everything numbered 0001–0015 and every `D-NNN-NN` record predates 0017. They
  remain accurate as history"). Not docked against current behaviour, so not swept for it.
- `kaola-workflow/dp/.cache/run-progress.json` deletion — a run-state file under `kaola-workflow/**`,
  referenced by no doc surface. Nothing to update.
- The five test-only files (`simulate-workflow-walkthrough.js`, `test-sink-merge.js`,
  `test-finalize-door.js`, `test-opencode-edition.js`, `test-kimi-edition.js`) add coverage for
  behaviour documented elsewhere; only `test-finalize-door.js` has a README table entry, checked at
  item 1.

---

## BLOCKS

None. Every structured claim above is transcribed from source read in this worktree, with the file
and line cited; the two validator runs and the `isValidationInvisible` measurement are real
invocations whose output is quoted verbatim.
