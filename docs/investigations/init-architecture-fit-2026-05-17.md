# Does `/workflow-init` need to change given the current architecture vision?

**Date:** 2026-05-17
**Status:** Investigation — for review before filing as a GitHub issue (or filing as "no change required")

---

## Mission

The open architecture issues (#40, #41, #42) describe substantial changes to
how Kaola-Workflow selects, claims, executes, and finalizes work. None of
those issues call out `/workflow-init` (or its Codex twin
`kaola-workflow-init`) as in-scope. This investigation asks the question
explicitly and on the record: **does the bootstrapper need to change to
remain in sync with the new vision, or is it correctly invariant?**

The pattern of this doc mirrors the sink-entry-consolidation investigation —
state the current state with file:line evidence, enumerate the open changes,
and decide per-change whether init is downstream.

## Current state of init (verified)

| Component | File:line | What it does |
|---|---|---|
| Entry doc (Claude) | `commands/workflow-init.md` | Scans project state, writes `CLAUDE.md`, scaffolds `docs/` + `kaola-workflow/`, optionally claims a session |
| Entry doc (Codex) | `plugins/kaola-workflow/skills/kaola-workflow-init/SKILL.md` | Same shape; writes `AGENTS.md` instead of `CLAUDE.md`, runs `install-codex-agent-profiles.js` |
| Roadmap mirror bootstrap | `commands/workflow-init.md:216-221` | Creates `kaola-workflow/.roadmap/` and runs `kaola-workflow-roadmap.js generate` |
| Session claim (optional) | `commands/workflow-init.md:271-285` | If `KAOLA_SESSION_ID` is unset, generates a UUID and calls `kaola-workflow-claim.js claim` |
| Workflow guidance in `CLAUDE.md` template | `commands/workflow-init.md:115-135` | Compact Kaola-Workflow section; mentions `/workflow-next` as the sole router |
| Mandated scaffold | `commands/workflow-init.md:175-186` | `kaola-workflow/{ROADMAP.md, archive/}`, `docs/{README, architecture, api, conventions, decisions/}`, `CHANGELOG.md` |

Init does **not** currently:
- write `kaola-workflow/config.json` (the file the classifier reads for
  `priority_top_tier_labels` at `scripts/kaola-workflow-claim.js:922-934`),
- touch `.gitignore`,
- mention sink mode, PR sink, `/workflow-next-pr`, `KAOLA_WORKTREE_NATIVE`,
  or worktree paths in either entry doc or the `CLAUDE.md`/`AGENTS.md`
  templates.

These omissions are the surface area the open issues might or might not
touch. Each is evaluated below.

## Per-issue analysis

| Issue | Vision summary | Init in scope? | Notes |
|---|---|---|---|
| **#42** Sink consolidation | Drop `/workflow-next-pr`; sink comes from prompt intent + auto-fallback | **No** | Init already references only `/workflow-next`; CLAUDE.md template stays correct |
| **#41** Gap 1: top-tier label discovery | Auto-recognize project's real top-priority label | **Conditional** | Depends on which Phase 1/2 option wins (see §3 below) |
| **#41** Gap 2: structured `claim:none` fallback | Typed `next_action` field in startup payload | **No** | Pure runtime behavior of `kaola-workflow-claim.js startup`; init never sees the payload |
| **#41** Gap 3: phantom-advisor gate | Hook that blocks "per advisor" text without a real advisor invocation | **No** | Lives in `.claude/settings.json` or as a `PostToolUse` hook policy |
| **#40** Worktree-native contract | Native pick/branch/worktree/session guarantees | **No (with one optional doc nudge)** | Worktrees live at `<repo>.kw/` (sibling of repo) per `scripts/kaola-workflow-claim.js:588`, so no `.gitignore` change needed; init does not create or own `.kw/` |
| **#39** Classifier path regex / phase ≤ 2 / ticker zombies | Path regex fixed on `dfe2e1b`; phase-detection and ticker bugs remain | **No** | All three live in `kaola-workflow-claim.js` / `kaola-workflow-classifier.js`; init is a downstream caller of `claim`. The session-claim block at `commands/workflow-init.md:271-285` inherits the ticker zombie behavior but cannot fix it — see "Out of scope" |

The single architecturally interesting cell is **#41 Gap 1**. Everything
else is "init is not the right layer."

## §3 — The one conditional case: #41 Gap 1 (top-tier label discovery)

Gap 1 proposes three options (issue #41 body, "Options to evaluate"):

**Option A — Default-include common patterns** (built-in list like
`["blocker", "showcase-gap", "release-blocker"]`).
**Option B — Glob/regex in `priority_top_tier_labels`** (e.g. `"*Gap*"`).
**Option C — Startup hint** when the repo has unrecognized priority-style
labels.

Init's role under each branch:

### Under Option A (built-in defaults)
Init writes nothing new. The classifier's built-in list works on first run.
- **CLAUDE.md template:** unchanged.
- **Scaffold:** unchanged.
- Verdict: no init change.

### Under Option B (glob/regex config)
Init still writes nothing *required*. The config is opt-in. But init
already runs `gh issue list --limit 100` at step 1 — it has the label
inventory in hand and could optionally seed
`kaola-workflow/config.json` with a commented stub:

```json
{
  "_comment": "Add top-priority labels here. Globs supported (e.g., \"*Gap*\").",
  "priority_top_tier_labels": []
}
```

Discoverability rationale: same logic that already creates
`docs/architecture.md` as a placeholder. The classifier's
`safeReadLabels` (`scripts/kaola-workflow-claim.js:922-934`) tolerates an
empty array — no behavior change at runtime. This is parallel in shape
to the existing Codex pattern of init calling
`install-codex-agent-profiles.js` to materialize `.codex/agents/...`
profiles (`plugins/kaola-workflow/skills/kaola-workflow-init/SKILL.md:28-36`)
— init has precedent for materializing config the user might never
otherwise discover.

- **Required:** no.
- **Recommended:** yes, for discoverability.

### Under Option C (startup hint only)
Init writes nothing. The hint lives in `kaola-workflow-claim.js
startup` output. The CLAUDE.md template could optionally mention the
knob name in the Kaola-Workflow section so users have a pointer when
they see the hint, but this is a one-liner addition, not a structural
change.

- **CLAUDE.md template addition (if desired):**
  ```
  - Top-priority labels: declare in `kaola-workflow/config.json`
    (`priority_top_tier_labels`) when the repo uses something other than
    `P0..P3`.
  ```

### Recommendation under Gap 1

**Defer the init decision until #41 Phase 1/2 picks A/B/C/combination.**
The investigation should not prejudge the issue. Once the option is
chosen:

- **A:** close this thread as "no init change."
- **B or A+B:** add a small init step that writes
  `kaola-workflow/config.json` with an empty/commented template.
- **C:** add one CLAUDE.md template line documenting the config knob.

## §4 — Optional doc nudge for #40 (low priority)

#40 establishes that worktree-native is becoming the canonical path.
Init's CLAUDE.md template currently has no mention of `.kw/` worktrees
or `KAOLA_WORKTREE_NATIVE`. The repo's README already documents this
(`README.md:504`), so init does not need to duplicate the explanation.

A one-line cross-reference in the Kaola-Workflow section of the CLAUDE.md
template would be defensible:

```
- Active issue work runs in a sibling worktree at `<repo>.kw/<project>/`
  when `KAOLA_WORKTREE_NATIVE=1`; see README for the full contract.
```

- **Required:** no.
- **Recommended:** low priority; revisit after #40 lands so the
  reference points at stable text.

## §5 — Sink-mode and `/workflow-next-pr` (#42)

The CLAUDE.md template in init already lists `/workflow-next` as the
entry command (`commands/workflow-init.md:117`) and makes no mention of
`/workflow-next-pr`. After #42 lands, the template is still correct.
Sink mode is workflow runtime behavior; project bootstrap does not
need to declare it.

- Verdict: no init change required by #42.

## Out of scope (explicit cross-references)

These items appear in the open issues but are not init's job to fix:

- **#39 Bug 3 (ticker zombies):** The session-claim block at
  `commands/workflow-init.md:271-285` inherits the orphaned-ticker
  problem because it calls `kaola-workflow-claim.js claim`, which spawns
  the ticker subprocess. The fix is in `claim.js` — kill the ticker
  on session exit / on lock release. Init is a downstream caller; it
  cannot lifecycle-manage a subprocess it didn't spawn directly. Track
  the fix on #39 (or its successor), not here.
- **#39 Bug 2 (phase ≤ 2 false positive):** Lives in
  `kaola-workflow-classifier.js:268-278`. Init does not own classifier
  logic.
- **#41 Gap 2 (`claim:none` typed recovery):** Pure runtime payload
  shape change in `kaola-workflow-claim.js`. Init never consumes the
  startup payload.
- **#41 Gap 3 (phantom-advisor gate):** Hook policy; lives in
  `.claude/settings.json` or as a managed hook the user enables. Init
  could *in principle* offer to install the hook, but that is an
  ECC-policy decision, not a bootstrap concern.
- **#42 Sink dispatch:** Phase 6 / `kaola-workflow-finalize` concern.
  Init does not write sink-related artifacts.
- **`.gitignore` for `.kw/`:** Verified — `provisionWorktree()` at
  `scripts/kaola-workflow-claim.js:588` places the worktree at
  `path.dirname(root) + path.basename(root) + '.kw'`, i.e. **outside**
  the repo tree. No `.gitignore` entry is needed; no init change required.

## Acceptance criteria

This investigation is done when:

- [ ] The per-issue table is reviewed and signed off (each "No"
  verdict is either accepted or flipped with a counter-example).
- [ ] #41 Phase 1/2 has chosen A / B / C / combination for Gap 1; the
  conditional init action under §3 is either scheduled or dismissed
  accordingly.
- [ ] If #40 lands before any init change, the optional doc nudge in
  §4 is filed as a small documentation issue (not a blocker).

## Recommendation

**No mandatory `/workflow-init` change** is required by the current
architecture vision. The bootstrapper is correctly invariant: it sets
up project structure, scaffolds docs, and points users at
`/workflow-next`. None of #40, #41, or #42 changes what those
responsibilities are.

The **single conditional touch-point** is `kaola-workflow/config.json`
seeding under #41 Gap 1 Option B (or A+B). Defer that decision to #41's
Phase 1/2 to avoid prejudging the issue.

Two **optional low-priority doc nudges** in the CLAUDE.md template
(#40 worktree-native cross-reference; #41 Gap 1 config knob pointer
under Option C) are worth a one-line addition each if and when the
parent issues land — they cost nothing and improve discoverability.

## Suggested labels (if filed as an issue)

`type:investigation`, `area:workflow-init`, `priority:low`,
`status:awaiting-#41-decision`
