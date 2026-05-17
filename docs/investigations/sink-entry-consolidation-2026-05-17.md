# Consolidate sink entry: remove `/workflow-next-pr`, drive sink from prompt intent + merge-fallback

**Date:** 2026-05-17
**Status:** Draft — ready to file as a GitHub issue

---

## Mission

**Sink mode is a property of the work, not a property of the entry command.**

Phase 6 already treats it that way — it reads `sink:` from `workflow-state.md`
and dispatches to either `kaola-workflow-sink-merge.js` or
`kaola-workflow-sink-pr.js`. The `/workflow-next-pr` command (and its Codex
mirror `kaola-workflow-next-pr`) exists *only* to set that single bit at claim
time. There is no other reason for a parallel entry to exist.

Merge with branch cleanup is the correct default for our work. PR mode is
either an **explicitly requested finish state** (the user wants the work to land
as a published PR rather than a local fast-forward) or an **automatic fallback**
when merge cannot happen (branch protection, missing perms, conflicts, dirty
target). Either way, Phase 6 is the natural decision point — and the user's
intent is already known by then because it was stated in the original prompt.

Replace the parallel `-pr` entry point with prompt-driven intent capture plus
auto-fallback, and the workflow entry surface drops from two commands × two
runtimes (four entry points) to one, with no loss of capability.

## Current state (verified)

| Component | File:line | What it does |
|---|---|---|
| Entry shim (Claude) | `commands/workflow-next-pr.md` | `export KAOLA_SINK=pr`, delegate to `/workflow-next` |
| Entry shim (Codex) | `plugins/kaola-workflow/skills/kaola-workflow-next-pr/SKILL.md` | Same, for Codex skill router |
| Env → flag | `plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md:42-47` | Reads `$KAOLA_SINK`, passes `--sink $KAOLA_SINK` to claim startup |
| Persistence | `plugins/kaola-workflow/scripts/kaola-workflow-claim.js:891` | Writes `sink: merge` (default) or `sink: pr` to `workflow-state.md` at claim time |
| Read & dispatch | `plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md:217-228` | Phase 6 reads `sink:` from state file, dispatches to correct sink script |
| Contract assert | `plugins/kaola-workflow/scripts/validate-workflow-contracts.js:299-301` | Asserts the wrapper command file exists and is ≤40 lines |

## Proposal

### Default behaviour

`sink: merge` (with branch cleanup after merge). This is what happens when the
user gives no PR-related instruction.

### Two triggers for PR sink

**Trigger A — explicit prompt intent (claim-time):**
At workflow start, the agent reads the user's initial prompt. If the prompt
expresses PR intent — phrases like "publish as PR", "finish with PR mode",
"open a pull request when done", etc. — the agent writes `sink: pr` into
`workflow-state.md` during the claim step. The detection is the agent's
responsibility (it is in the natural-language path already), not a parser
embedded in `kaola-workflow-claim.js`.

When the agent classifies the prompt as PR intent, it passes the existing
`--sink pr` flag through to `kaola-workflow-claim.js startup` — the same wire
the deleted `-pr` entry skill used. The claim script does not change shape;
only the *caller* of the flag does.

**Trigger B — auto-fallback at Phase 6 (finalize-time):**
Phase 6 attempts the configured sink. If `sink: merge` is configured and the
merge cannot proceed for an environmental reason — branch protection, missing
push permission, conflicts with target, target not fast-forwardable — Phase 6
pivots to PR sink instead of stalling.

The pivot is gated to a defined list of "merge-impossible" failure modes; it
must NOT trigger on transient errors (network blip, rate limit) or
user-correctable errors (uncommitted changes — those should still stop and
ask). When the pivot fires, Phase 6:

1. Updates `sink:` in `workflow-state.md` from `merge` → `pr` with a
   `sink_fallback_reason:` field explaining why (e.g. `branch_protected`,
   `non_fast_forward`, `permission_denied`).
2. Records the pivot in the Phase 6 summary.
3. Dispatches to `kaola-workflow-sink-pr.js` as if PR had been the original
   intent.

### Removal scope ("delete radius")

These must change atomically in the same PR:

1. **Delete** `commands/workflow-next-pr.md`
2. **Delete** `plugins/kaola-workflow/skills/kaola-workflow-next-pr/SKILL.md`
3. **Delete** the assertion block in
   `plugins/kaola-workflow/scripts/validate-workflow-contracts.js:299-301`
   and the parallel skill-count assertion in
   `validate-kaola-workflow-contracts.js` (currently asserts 9 skills, must
   drop to 8).
4. **Update** `README.md`:
   - Remove `/workflow-next-pr` from the commands list (line ~181).
   - Replace the "PR Sink Mode" section (lines ~390-394) with the new
     prompt-intent + auto-fallback explanation.
5. **Update** `CHANGELOG.md` with an entry under [Unreleased] noting the
   command removal, the prompt-intent capture, and the auto-fallback.
6. **Modify** `plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md`:
   - Keep the `--sink` pass-through (it is the wire used by intent capture).
   - Add a brief "Intent capture" subsection: when the user's initial prompt
     contains PR intent (phrasing examples listed), set `KAOLA_SINK=pr` before
     the startup call. This is the same wire as before, just driven by NLU
     instead of a slash-command shim.
7. **Modify** `plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md`:
   - Wrap the sink dispatch (lines 211-228) with a merge-fallback check.
   - Define the merge-impossible failure modes that trigger the pivot.
   - On pivot, update `workflow-state.md` (`sink:` and `sink_fallback_reason:`)
     before dispatching to `kaola-workflow-sink-pr.js`.
8. **Modify** `kaola-workflow-claim.js`:
   - Recognize a `sink_fallback_reason` field when reading/writing state (no
     change to the `--sink` flag plumbing).
   - Keep the `--sink` CLI flag and `KAOLA_SINK` env var as-is — they are now
     the wire used by intent capture, not by a parallel entry.

## Acceptance criteria

- [ ] `/workflow-next-pr` no longer appears in `commands/` or `skills/`.
- [ ] `grep -r "workflow-next-pr" .` returns only archive references and the
  CHANGELOG removal entry.
- [ ] A workflow started with a prompt containing PR intent (e.g. "publish as
  PR when done") produces `sink: pr` in `workflow-state.md`.
- [ ] A workflow started with no PR intent produces `sink: merge` in
  `workflow-state.md`.
- [ ] At Phase 6, an issue with `sink: merge` whose merge fails with branch
  protection produces a state update to `sink: pr` with
  `sink_fallback_reason: branch_protected`, then dispatches to
  `kaola-workflow-sink-pr.js`.
- [ ] At Phase 6, an issue with `sink: merge` whose merge fails with a
  *transient* error (network, rate limit) does NOT pivot — it surfaces the
  error and waits for the user.
- [ ] In-flight projects (existing `workflow-state.md` with `sink:` already
  set) are unaffected by the upgrade — `sink:` field remains the source of
  truth.
- [ ] `node scripts/simulate-workflow-walkthrough.js` exits 0 with the new
  prompt-intent and auto-fallback paths covered.
- [ ] Both `validate-workflow-contracts.js` and
  `validate-kaola-workflow-contracts.js` pass without the deleted
  command/skill assertions.
- [ ] README and CHANGELOG reflect the new entry-point shape.

## Out of scope (explicitly)

- **GitHub issue labels.** Considered as a declaration site and rejected:
  intent lives in the user's prompt, not in label metadata. (Labels add a
  separate manual step that the prompt already conveys.)
- **Mid-workflow intent change.** Once `sink:` is written at claim time, it is
  fixed for that workflow unless the auto-fallback fires at Phase 6. A user
  command to change intent mid-workflow (e.g. `set-sink`) is a separate
  proposal.
- **Per-repo default sink override.** All workflows default to `merge` unless
  the user's prompt signals otherwise. A repo-wide override flag is not
  introduced here.
- **PR sink kinds beyond `pr`.** Draft-PR, stacked-PR, and similar are not
  added.

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Agent fails to detect PR intent in an ambiguous prompt | The agent's `kaola-workflow-next` skill will list a few canonical intent phrases ("publish as PR", "finish with PR", "open a pull request when done"). If detection is uncertain, the agent should ask the user once at claim time. Auto-fallback is the safety net if intent was wrong. |
| Auto-fallback pivots on a transient error and locks the workflow into PR sink | Strict allow-list of "merge-impossible" failure modes: branch protection, push permission denied, non-fast-forward, target-branch conflict. Transient/recoverable errors stop and ask, do not pivot. |
| Existing in-flight workflows broken by removal | None — `sink:` field is already persisted in their `workflow-state.md`; Phase 6 reads from the file, not from labels or env. Verified at finalize:217. |
| Codex parity drift (one runtime gets the upgrade, the other doesn't) | Atomic PR: ship both runtime updates and both validator updates together. The `cross-machine-followups/phase2-ideation.md` design doc must also be revised to drop the now-obsolete `kaola-workflow-next-pr` reference. |
| User who relies on `/workflow-next-pr` muscle memory | CHANGELOG entry calls it out; README documents the replacement; the slash command will return "unknown command" — clearer than a silent behaviour change. |

## Test plan

1. **Unit (`simulate-workflow-walkthrough.js`):**
   - Claim with `--sink pr` flag → expect `sink: pr` in state.
   - Claim with no flag → expect `sink: merge` in state.
   - Finalize with `sink: merge` against a branch-protected target → expect
     pivot to `sink: pr` with `sink_fallback_reason: branch_protected`.
   - Finalize with `sink: merge` against a transient `gh` failure → expect
     no pivot, error surfaced.
2. **Integration:** Run a real workflow end-to-end on a throwaway GitHub
   issue with a prompt containing PR intent; confirm Phase 6 dispatches to
   `kaola-workflow-sink-pr.js`.
3. **Integration (fallback):** Run a real workflow on a target branch with
   protection rules enabled; start with no PR intent in the prompt; confirm
   Phase 6 pivots to PR sink and records the fallback reason.
4. **Contract:** `validate-workflow-contracts.js` and
   `validate-kaola-workflow-contracts.js` both pass.
5. **Docs check:** `grep -r "workflow-next-pr" .` returns only archive
   references and the CHANGELOG removal entry.

## Suggested labels for the issue

`type:refactor`, `area:workflow-entry`, `priority:medium`, `breaking-change`
(the slash command is removed — users who type `/workflow-next-pr` will get
"unknown command")
