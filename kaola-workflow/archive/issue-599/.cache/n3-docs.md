evidence-binding: n3-docs c0f17c3e3288

# n3-docs evidence — issue #599 documentation

Leg worktree: /Users/ylpromax5/Workspace/Kaola-Workflow/.kw/legs/issue-599/n3-docs
Leg branch: kw/legs/issue-599/n3-docs (verified via `git branch --show-current`)

## Ground truth used

- `gh issue view 599 --json title,body,number,state` (the default field set 500'd on a
  missing `read:project` scope; re-ran with explicit `--json title,body,number,state` and
  got the full issue body). State: OPEN.
- Read `docs/decisions/D-595-01.md` and `docs/decisions/D-596-01.md` in the leg as sibling
  ADR structure references (Date/Status/Issue/Related header, Context/Decision/
  Consequences/Alternatives considered sections).
- Read the existing speculative-open kernel sections in `docs/api.md` (lines 291, 307-318)
  and `docs/architecture.md` (lines 286-311) to find natural anchors.
- Did NOT read any code in `scripts/kaola-workflow-adaptive-node.js` for the fix mechanics —
  per the task instructions the leg's copy predates n1's fix (branched from parent HEAD
  before n1 committed), so ground truth is the issue body + the task description's exact
  wording, not the leg's own tree.

## Per-file changes (leg paths)

1. **`docs/decisions/D-599-01.md` (new)** — full decision record: Context (fail-open bug in
   `selectSpeculativeWriteGroup`'s `ps.overlapping || []` fallback vs. `tryFormLaneGroup`'s
   `{ok:false}` fail-closed posture on ANY non-ok `--parallel-safe` result; the three
   redundant nets the issue-596 review gate cited for why it was judged non-blocking LOW
   rather than a blocker), Decision (mirror `tryFormLaneGroup`: any non-ok result missing a
   well-formed `overlapping` array excludes every candidate; a well-formed non-ok result
   WITH an `overlapping` array, even empty, is unaffected — existing per-pair exclusion
   still runs), RED-first proof (`T599-1a`/`1b`/`1c`, `test-adaptive-node` 1310→1314),
   Consequences (both callsites now share one error posture; positive path byte-unchanged;
   cross-edition GENERATED_AGGREGATOR four-chain obligation), Alternatives considered
   (leave fail-open given the nets — rejected: two callsites of one predicate should share
   one posture; exclude only the named candidates from a malformed result — rejected: a
   malformed result carries no reliable partial information). Followed the
   Date/Status/Issue/Related → Context → Decision → Consequences → Alternatives structure
   of D-595-01/D-596-01.
2. **`docs/api.md`** — one-line addition inside the existing "Write member mechanics (#596,
   D-596-01)" paragraph of the Speculative-open kernel section (after the sentence
   describing `selectSpeculativeWriteGroup`'s RE-VERIFIES-disjointness / fan-out-cap
   accounting, before the no-leg-capability sentence): a new sentence labeled
   "**Fail-closed on a validator subprocess failure (#599, D-599-01):**" stating that a
   non-ok `--parallel-safe` result lacking a well-formed `overlapping` array now mirrors
   `tryFormLaneGroup`'s posture and excludes every speculative write candidate, while a
   well-formed non-ok result carrying a real (even empty) `overlapping` array is
   unaffected. Transcribed behavior only — no code copied, no new field names invented
   (reused the existing `speculativeWriteExcluded` / `--parallel-safe` / `overlapping`
   vocabulary already in the surrounding prose).
3. **`docs/architecture.md`** — **left untouched, declared-but-unwritten.** Reason: the
   file's speculative-write-graduation paragraph (lines 296-311, inside the "Parallelism v3
   design" block, citing D-596-01) documents the STATIC eligibility conditions (exactly
   resolvable, no PROTECTED file, not the unique sink), the per-member leg mechanics, and
   the discard-only-on-fail asymmetry — but does NOT mention the RUNTIME open-time
   disjointness re-verification (`selectSpeculativeWriteGroup` re-checking against
   currently-live writers) at all; that mechanic is described only in `docs/api.md`'s
   "Write member mechanics" paragraph, not in architecture.md. Confirmed via
   `grep -n "RE-VERIF\|re-verif\|re-check\|runtime overlap\|--parallel-safe" docs/architecture.md`
   — no hit inside the speculative-write section (the one `--parallel-safe` hit in the file,
   line 244, is inside the UNRELATED normal lane-group co-open paragraph, not the
   speculative-write one). Per the task's explicit instruction ("If no natural anchor
   exists, leave the file untouched and record why in evidence"), no edit was made.

## Leg discipline confirmation

- `git status --short` in the leg shows exactly two changes: `M docs/api.md` and
  `?? docs/decisions/D-599-01.md` — both inside the declared write set, nothing else
  touched (no `docs/architecture.md`, no `CHANGELOG.md`, no other file).
- Every Edit/Write in this run used an absolute path prefixed with
  `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/legs/issue-599/n3-docs/`.
- Every Bash command in this run was prefixed with
  `cd "/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/legs/issue-599/n3-docs" && `.
- This evidence file is the sole write outside the leg, at the designated parent path.

## Deviations

None from the declared write set. `docs/architecture.md` was evaluated and correctly left
unwritten per the task's own stated fallback (declared-but-unwritten is legal).
