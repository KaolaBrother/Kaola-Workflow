# Adversarial review — lens: can this system still report a verdict that is not true?

Reviewer: adversarial verifier (false-verdict lens). Read-only on
`workflow/bundle-904-905-906-907-908-909-910`; nothing on the branch was edited, staged or committed.
Fixtures under `/private/tmp/claude-501/-Users-ylpromax5-Workspace-Kaola-Workflow/8070a702-f33f-4c74-8c66-4434a7ea9c6d/scratchpad/adv/`.

**verdict: fail — 3 CONFIRMED findings (1 blocking, candidate-caused), 0 suspected.**

Everything below was DRIVEN with the real scripts and is reproducible from the harnesses named.
Where a leg could have been vacuous, a control was run and is reported beside it.

---

## R1 — BLOCKING, candidate-caused. The #910 fix makes the ordinary retry lane WORSE than HEAD: a green chain run over the finalized tree is classified `chains_stale`, and the receipt that actually covers that tree is destroyed before it reaches the archive.

**One sentence.** `run-chains --project` now writes the receipt into MAIN's run folder, but `cmdFinalize`'s
Step 8a mirror copies main's `.cache/` *forward* over the worktree's with no staleness test — so once any
finalize has mirrored-then-refused, every later `run-chains` from the worktree lands in the worktree
(local-first resolution) and the next finalize overwrites that fresh receipt with main's older one.

**Scenario (inputs → wrong verdict).** Standard posture: run folder resident in MAIN, linked worktree
on the branch. Harness: `scratchpad/adv/w910.js`.

| step | action | observed |
|---|---|---|
| A | `run-chains --project P` from the worktree | receipt lands in **MAIN**, `codeTreeHash 959a31b7…` (the #910 fix working) |
| B | `finalize --keep-worktree` with the implementation not yet committed | exit 1 `implementation_commit_missing` — but Step 8a already ran: `<wt>/kaola-workflow/P/` now **exists** |
| C | operator commits the implementation (tree hash → `5051d3c9…`), re-runs `run-chains --project P` from the worktree | receipt lands in the **WORKTREE** (`5051d3c9…`); MAIN still holds `959a31b7…` |
| D | `finalize --keep-worktree` | Step 8a mirror copies MAIN's `959a31b7…` over the worktree's `5051d3c9…`; gate reports **`chains_stale`** — "code changed since the chains ran" — over a tree the chains had *just* run green on |

Aftermath: the archive at `main/kaola-workflow/archive/P/.cache/chain-receipt.json` carries
`959a31b7…` — a receipt bound to a tree that no longer exists. The receipt that did cover the
finalized tree is gone from every copy.

**This is a regression, not a pre-existing hole.** One-axis A/B, identical fixture, identical command
sequence, identical `claim.js`; only `scripts/kaola-workflow-run-chains.js` differs
(`scratchpad/adv/w910_prefix.js` points at `scratchpad/adv/mirror/`, a copy of the branch's `scripts/`
with **only** run-chains.js replaced by `git show main:…`, verified byte-identical):

```
run-chains @ main (2018521f)  -> step A lands in WORKTREE, step D validation = chains_green
run-chains @ branch           -> step A lands in MAIN,     step D validation = chains_stale
```

Pre-#910 a `--project` run invoked from the worktree wrote only into the worktree, so main held no
receipt for the mirror to push forward and the fresh worktree copy survived. The fix supplies main
with exactly the stale copy the mirror then clobbers it with.

**Also a green control**, to show the fixture is not simply broken: `scratchpad/adv/w910ctl.js` —
same final tree, same commands, the refused finalize in step B **omitted** — receipt lands in MAIN and
step D reports `chains_green`. The single axis is the mirrored-then-refused finalize.

**Anchors.**
- `scripts/kaola-workflow-run-chains.js:801-807` — `resolveProjectRecordDir`, the new arm.
- `scripts/kaola-workflow-validation-runner.js:1228-1235` — `resolveRecordFolder` searches the
  INVOKING tree first and only falls back to main. The fix therefore holds only while the worktree
  does not carry the run folder.
- `scripts/kaola-workflow-claim.js:3342` — `mergeCopyDir(srcDir, destDir, FINALIZE_MIRROR_DEST_OWNED)`,
  the main→worktree mirror that constructs `<wt>/kaola-workflow/P/`.
- `scripts/kaola-workflow-claim.js:3196-3198` — `mergeCopyDir` drops `keepExisting` in its own
  recursion (`mergeCopyDir(s, d)` with two arguments), so **every** file under `.cache/` is overwritten
  unconditionally; `FINALIZE_MIRROR_DEST_OWNED` protects only the two top-level names.

**Reachability.** The trigger is *any* finalize that reaches Step 8a and then refuses. `cmdFinalize`
runs the mirror at `claim.js:3939`, before every gate; the refusals downstream of it include
`finalize_gate_unverified` (:3974), `implementation_commit_missing` (:4022), the single-project staging
guard (:4038), `archive_refused` (:4077) and `archive_incomplete` (:4097). `implementation_commit_missing`
is not an edge case — the machinery deliberately never authors the implementation commit, so a finalize
run before the orchestrator commits is a designed refusal.

**Note on the note.** The comment at `run-chains.js:1034-1046` claims the resolver change means "under
a worktree run run-chains writes nothing there at all". That is true only for the first invocation.
After Step 8a it writes there again, and the sidecar telemetry follows it.

---

## R2 — the #907 false green SURVIVES on the probe that FEEDS the converted call. Pre-existing (untouched code), same envelope, same clean archive.

**One sentence.** `#907` converted the `git add` catch at `claim.js:4636` but left the
`git status --porcelain` probe that produces its pathspec list swallowing at `claim.js:4614`, and left
the two archive-staging calls beside it (`:4531`, `:4549`) as bare `catch (_) {}` — so a fault in any
of those three still yields the exact original signature.

**Scenario (inputs → wrong verdict).** `scratchpad/adv/w907.js statusfail` — same MAIN-resident
worktree posture, deliverable `src/pending-good.js` untracked, worktree index corrupted so
`git status --porcelain` exits 128 (premise asserted in the harness output):

```
exit                  = 0
status                = "closed"
closure_invariants.ok = true
finalize_transaction  = {"mirror":"mirrored","impl_commit":"indeterminate","roadmap_staged":true,
                         "archive_commit":"deferred_to_sink","residue_stage":"skipped",
                         "finalize_commit":"nothing_to_commit"}
git log               = feat: implementation | init      <- no chore: archive, no chore: finalize
src/pending-good.js committed?  false
archived finalization-summary.md contains "## Finalize Findings"?  false
```

That is the defect verbatim — including the property the brief names as the worst one: **the archived
record reads exactly as clean as a finalize that committed everything.** `residue_stage: "skipped"` is
documented at `claim.js:3928` as "no residue to stage", which is a false statement about a probe that
failed.

**Controls, both run:** `w907.js control` → `residue_stage:"staged"`, `finalize_commit:"committed"`,
deliverable in the tree. `w907.js unreadable` (the route #907 *did* convert) → exit 0,
`residue_stage:"failed"`, `residue_unstaged:["locked.md","src/pending-good.js"]`, git's own
`fatal: adding files failed` on the envelope, and `## Finalize Findings` naming `src/pending-good.js`
in the **archived** `finalization-summary.md` under main. So the converted half genuinely works, in the
real main-resident posture the suite's T9 fixture does not exercise — this finding is about the three
calls beside it, not about that one.

**Two more false statements visible in the same envelope, both from the unconverted catches:**
- `archive_commit: "deferred_to_sink"` while `git rm --cached` (:4531), `git add -A` (:4549) and
  `git diff --cached --quiet` (:4579) all failed and were discarded — no archive commit was authored.
- `roadmap_staged: true` — `claim.js:4551` derives it from the *candidate list*
  (`existingPaths.some(...)`), never from whether the `git add` at :4549 succeeded. It reports `true`
  whenever the two roadmap paths exist on disk, including when the add exited non-zero and staged
  nothing.

**Trigger realism, stated honestly.** I drove it with a corrupt index, which is a real but uncommon
fault. The structural point does not depend on that choice: the same catch discards *every* failure of
that probe, and the two archive-staging catches beside it discard an ignored pathspec, a held index
lock, a permission fault and a full disk — the same list `#907`'s own new comment gives as the reason
the fix "is the report and not the parse". `git add` failure is now reported; `git status` failure and
archive-staging failure are not.

**Anchors.** `scripts/kaola-workflow-claim.js:4614` (`catch (_) { /* unprobeable status … */ }`),
`:4531`, `:4549`, `:4551`.

---

## R3 — `isEditionCouplingPath` still scopes an edition-touching diff to ONE chain when the plugins path is the SOURCE of a rename. Pre-existing (upstream of the parser fix).

**One sentence.** `computeChangedFiles` asks `git diff --name-only -z`, which for a rename reports
only the DESTINATION — so moving a file *out of* `plugins/` deletes a file from an edition tree while
the changed-file set never mentions `plugins/` at all.

**Scenario (inputs → wrong verdict).** `scratchpad/adv/r1`:
`git mv plugins/kaola-workflow/scripts/moved.js src/moved.js`, then

```
$ git diff --name-only -z <base> | tr '\0' '\n'
src/moved.js                         <- the plugins path is not in the stream at all

$ classifyScope(...)  (branch run-chains, /tmp/probe2.js)
{ "decision": "claude-only", "reason": "non_edition_diff",
  "touchedEditionPaths": [], "changedFileCount": 1, "chains": ["claude"] }
```

Three chains are skipped over a diff that removed a file from the Codex plugin tree.

**Discriminated, not guessed.** A *pure delete* of the same file (`scratchpad/adv/r2`) is caught
(`decision: all-four`, `touchedEditionPaths: ["plugins/kaola-workflow/scripts/gone.js"]`), and a rename
*into* plugins is caught (`scratchpad/adv/r6`). Rename detection collapsing the source is the whole
mechanism.

**And this is NOT the hole #907 closed** — that one is genuinely fixed and mutation-visible.
Positive control, `scratchpad/adv/r7`, a non-ASCII plugins path, same fixture, both run-chains copies:

```
run-chains @ main    -> decision "claude-only"  (the C-quoted fail-open)
run-chains @ branch  -> decision "all-four", touchedEditionPaths ["plugins/kaola-workflow/scripts/nöte.js"]
```

**Anchors.** `scripts/kaola-workflow-run-chains.js:648` (`git diff --name-only -z`),
`:708-742` (`isEditionCouplingPath`). The note at `:699-707` says the fail-closed guarantee's
"condition lives in the caller"; the caller's stream has a second condition it does not state —
rename detection must not be hiding a pre-image.

---

## What I attacked and could NOT break

Recorded so the frontier is visible, not as reassurance.

**Claim 3, the parser — not refuted.** `parsePorcelainPaths` survived every construction I could drive.
Round-tripped through real git (`scratchpad/adv/parseprobe.js`, `r3`) in BOTH modes over 12 hazard
names — trailing space, leading space, non-ASCII, embedded newline, embedded `"`, `\`, TAB, BEL,
astral emoji, a literal `\303` byte sequence, and `arrow -> here.md`: every decoded path exists on disk
and `git add --dry-run --` accepts it, and nothing on disk was missed. Renames (`scratchpad/adv/r4`):
git quotes a rename source containing a space (`R  "src -> old.md" -> dest.md`), so `renameArrowIndex`'s
quoted-source walk has the disambiguator it needs; `-z` renames (`R  dest\0source\0`, destination
first) consume the source correctly. Unit edges (`scratchpad/adv/edges.js`): empty, null, short record,
`XY ` only, copy `C`, worktree rename ` R`, unmerged `UU` on an arrow-named file, `-z` with a truncated
rename record, dangling backslash, unquoted field — all correct. The one input it mis-parses is a
NUL-and-LF *mixed* stream, which git cannot emit.

**Claim 1's converted route — not refuted.** Driven in the main-resident posture the suite does not
cover (`w907.js unreadable`): typed finding on the envelope AND `## Finalize Findings` in the
**archived** `finalization-summary.md`, exit 0, naming the healthy file that was lost. The archive
carries it because `result.dest` is under MAIN and the sink's `archive_commit` lands it.

**Claim 2's hash half — not refuted.** `codeTreeHash` binds the invoking tree in every leg I ran; the
`--project` record arm is the only thing that moved, exactly as the note says.

**`--output`/`--plan` precedence, and the fallback when the folder is live in neither tree** — behave
as documented; the fallback reproduces the pre-#910 answer, which is what a plain repository needs.
