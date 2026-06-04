# Lean-Orchestrator: Model-Resolver Fix + Contractor Offload — Implementation Plan

**Date:** 2026-06-04
**Tracking issue:** [#242](https://github.com/KaolaBrother/Kaola-Workflow/issues/242)
**Status:** planned, not started. Intended to be executed on a different machine.

Two related changes, sequenced. **Part A** is an independent, shippable bug fix and
the foundation for Part B. **Part B** is a staged architectural change. Build A first.

---

## Why

The 6-phase, fast, and adaptive paths all run a large amount of *procedural* work
(running scripts, parsing output, writing ledger/state/roadmap/archive) in the **main
session**. To keep the main orchestrator on Opus (for careful judgment) without paying
Opus context for that bookkeeping, move the mechanical work to a single Sonnet
**contractor** subagent. Separately, dynamically-dispatched adaptive nodes currently
inherit the Opus model by accident (Part A).

## Governing constraints (do not violate)

1. **Subagents cannot dispatch subagents.** No vendored agent grants `Task`/`Agent`
   (`agents/*.md` tools lists), and the harness disallows nested dispatch. ⇒ the
   contractor can **bracket** each dispatch but can never **own** the dispatch/barrier
   loop. The loop stays main-session.
2. **The model badge renders from the explicit `model=` on the dispatch call**, never
   from frontmatter (`commands/kaola-workflow-plan-run.md:30-32`; memory-confirmed).
   Installed agent frontmatter is intentionally rewritten to `model: inherit`
   (`install.sh:308-317`) so it doesn't fight the dispatch arg. **Neither change below
   re-pins frontmatter** — frontmatter stays `inherit`; dispatch still carries an
   explicit `model=`.
3. **Judgment line (issue #44):** mechanical script-running/file-writing → contractor
   (Sonnet). Anything the governance rules route to "assess risk / ask the user /
   escalate / select the issue", plus verifying irreversible external mutations
   (`gh issue close`), stays Opus.
4. **4-edition byte-sync.** `kaola-workflow-resolve-agent-model.js` is in a
   byte-identical group across all four copies
   (`scripts/validate-script-sync.js` → `BYTE_IDENTICAL_GROUPS` "resolve-agent-model
   module copies"). Any edit must be mirrored byte-for-byte to:
   - `scripts/kaola-workflow-resolve-agent-model.js`
   - `plugins/kaola-workflow/scripts/kaola-workflow-resolve-agent-model.js`
   - `plugins/kaola-workflow-gitlab/scripts/kaola-workflow-resolve-agent-model.js`
   - `plugins/kaola-workflow-gitea/scripts/kaola-workflow-resolve-agent-model.js`

---

## Part A — Model-resolver install-time, profile-aware fix

### Bug (verified)

`install.sh:308-317` rewrites every installed agent's frontmatter to `model: inherit`.
The runtime resolver reads that installed dir (`kaola-workflow-resolve-agent-model.js:26`,
default `~/.claude/agents`). `resolveAgentModel` is
`modelFromFile() || DEFAULT_AGENT_MODELS[name] || ''`, then maps `inherit → ''`. Because
the file says `inherit` (truthy), the `|| DEFAULT_AGENT_MODELS` branch is **never
reached** → the resolver returns **empty for every installed agent**. `DEFAULT_AGENT_MODELS`
is effectively dead code in a real install.

**Impact:** dynamically-dispatched adaptive nodes (code-explorer, code-architect,
security-reviewer, doc-updater, adversarial-verifier, docs-lookup — any role *not* one
of the four static placeholder examples) get no `model=` → **no badge** and **silently
inherit Opus**. Static nodes (tdd-guide, code-reviewer, build-error-resolver, planner)
are fine — the installer bakes their `model=` from the *pre-rewrite* source via
`resolve_agent_model_for_install` (`install.sh:431-456`).

### Why not the naive resolver-only fix

Making the resolver "fall through to `DEFAULT_AGENT_MODELS` when frontmatter is
`inherit`" silently **downgrades** under `--profile=higher`: the higher profile sources
code-architect / code-reviewer / **security-reviewer** as **opus**
(`agents/profiles/higher/*.md`), but `DEFAULT_AGENT_MODELS` hardcodes all three as
`sonnet`. The profile-aware source of truth only exists at install time.

### Design — install-time manifest

The installer already computes the correct profile-aware model per agent
(`resolve_agent_model_for_install`). Persist it where the runtime resolver can read it.

- **`install.sh`:** after `install_agent_files`, write a manifest
  `~/.claude/agents/.kaola-agent-models.json` = `{ "<agent>": "<model>", ... }` using
  `resolve_agent_model_for_install` for every `REQUIRED_AGENTS` entry. **Omit** agents
  that resolve to inherit/empty (they genuinely inherit). Manifest path overridable via
  the same `KAOLA_AGENT_DIR` base the resolver uses.
- **`kaola-workflow-resolve-agent-model.js`:** new precedence —
  **manifest[name] → frontmatter (if ≠ inherit) → `DEFAULT_AGENT_MODELS` → `''`**.
  Manifest is authoritative; `DEFAULT_AGENT_MODELS` survives only for
  uninstalled/test contexts. `inherit` no longer shadows anything. Read the manifest
  from `path.join(agentDir, '.kaola-agent-models.json')`; tolerate missing/unparseable
  manifest (fall through). **Mirror byte-for-byte to all 4 copies** (constraint 4).

### Badge preservation (explicit)

Frontmatter stays `inherit`; the dispatch still passes explicit `model=`. The manifest
only changes the **source of the value** the resolver returns. Net effect at a dynamic
node: today `resolver → '' → model= omitted → no badge → Opus`; after `resolver →
manifest → 'sonnet' → model="sonnet" → badge renders → correct model`.

### Files (Part A)

- `install.sh` — manifest emission (new helper + call site after `install_agent_files`;
  also remove the manifest on uninstall — see `uninstall.sh`).
- `uninstall.sh` — delete `.kaola-agent-models.json`.
- `scripts/kaola-workflow-resolve-agent-model.js` (+ 3 plugin copies, byte-identical) —
  manifest-first precedence.
- `scripts/test-agent-model-resolver.js` — add cases: manifest hit wins; higher-profile
  security-reviewer resolves opus; `inherit` frontmatter + manifest miss falls to
  DEFAULT; missing manifest tolerated.
- `scripts/test-install-model-rendering.js` / `test-install-adaptive-config.js` — assert
  the manifest is written with correct profile-aware values for `default` and `higher`.

### Gates (Part A)

- `node scripts/test-agent-model-resolver.js`
- `node scripts/validate-script-sync.js` (proves the 4 copies stayed byte-identical)
- `node scripts/simulate-workflow-walkthrough.js` → exit 0
- Install dry-run for both profiles; confirm manifest contents.

---

## Part B — Contractor offload (all paths, not phase 6 only)

### Three layers

1. **Scripts** (atomicity/determinism) — existing validator + **two new aggregators**:
   - `next-action --json` — compute ready-set / next node / resolved model for the
     adaptive loop (and an analogous "what's next" for phaseN).
   - `commit-node --json` — run the safe commit choreography in one call:
     `--record-base` (start) … `--barrier-check` + `--gate-verify` (end) → ledger row →
     `workflow-state.md` pointer LAST. Encapsulates the order the executor must not get
     wrong. These keep the per-node contractor prompt tiny so warm-up is cheap.
2. **Contractor** (Sonnet, stateless) — runs the scripts, parses subagent prose +
   `.cache` evidence, authors ledger rows / phase files / roadmap / archive, returns a
   **compact** summary. Never dispatches a role; never judges.
3. **Main (Opus)** — judgment + dispatch only; thin loop.

### Boundary rule (one line)

Opus decides *what* and dispatches *roles*; contractor does *everything that is just
running scripts and writing durable files*. Governance ("ask / assess risk / escalate")
and the `gh issue close` recheck stay Opus.

### Seams (where the contractor is invoked)

- **Adaptive node→node handoff** (highest recurrence; the "notes-to-notes" case): per
  node, contractor runs `commit-node`, verifies `.cache`, writes ledger row + state
  pointer. Opus: governance verdict, dispatch the role node, consent-halt/escalation.
- **Phase 6 finalize** (~715 lines today): the big mechanical block — sink-merge,
  parse closure receipt, regen roadmap mirror, archive. Opus keeps the `gh issue close`
  verify (memory: close can exit 0 yet leave the issue OPEN).
- **Phase 1**: contractor owns checkpoint writes / evidence consolidation / phase-file
  scaffolding; Opus owns research questions + synthesis.
- **Phases 2–5**: contractor brackets each dispatch (post-dispatch barrier/ledger/state
  writes).

The compression win is moving the **procedure text** out of Opus's command files into
the contractor's skill; Opus's commands shrink to thin "delegate the mechanical block"
stubs. Disk-durability (resume-safe state) is what lets a stateless contractor re-read
from disk each call.

### Files (Part B) — staged

1. **Aggregator scripts**: `scripts/kaola-workflow-next-action.js`,
   `scripts/kaola-workflow-commit-node.js` (+ register in `COMMON_SCRIPTS` /
   byte-sync as appropriate; mirror to plugin trees). Tests + walkthrough wiring.
2. **Contractor agent**: `agents/contractor.md` (`model: sonnet`, tools
   `Read/Write/Edit/Bash/Grep/Glob`). Register in `install.sh` `REQUIRED_AGENTS`
   (line 40), add `CONTRACTOR_MODEL` to `model_for_placeholder` + `render_command_file`
   placeholders, add to `DEFAULT_AGENT_MODELS` + the Part-A manifest. The inherit-rewrite
   is already generic. Add a `profiles/higher/contractor.md` only if the higher profile
   should raise it (default: stay sonnet).
3. **Rewire commands**, seam by seam, each mirrored to SKILL.md + 3 editions
   (github/gitlab/gitea) + the Codex command mirrors:
   - adaptive node-handoff (`commands/kaola-workflow-plan-run.md` +
     `plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md` + 2 editions)
   - `commands/kaola-workflow-phase6.md` (+ SKILL + editions)
   - `commands/kaola-workflow-phase1.md` (+ SKILL + editions)
   - phases 2–5.

### Tradeoff to keep in view

Broad per-node bracketing adds one extra round-trip per node (latency/tokens) to buy a
lean Opus context. The aggregator scripts + a thin contractor skill are what keep that
cost low — without them, per-node delegation is not worth it. If round-trip cost proves
too high in the loop, fall back to Opus calling the aggregator scripts directly there and
reserve the contractor for the bulky/fuzzy seams (phase 6, phase 1).

---

## Cross-cutting acceptance criteria

- [ ] Part A: dynamic adaptive nodes resolve to the correct profile-aware model; badge
      renders; security-reviewer stays opus under `--profile=higher`.
- [ ] `node scripts/validate-script-sync.js` passes (4 resolver copies byte-identical;
      any new common script mirrored).
- [ ] `node scripts/simulate-workflow-walkthrough.js` passes (exit 0).
- [ ] `npm test` passes.
- [ ] Parity across all four editions for every command/skill touched.
- [ ] Version bumped; `CHANGELOG.md` updated; docs map updated where interfaces changed.

## Open decisions (resolve before Part B coding)

1. Per-node contractor vs. Opus-calls-aggregator-directly in the adaptive loop (round-
   trip cost vs. context compression).
2. Whether `next-action`/`commit-node` join the byte-identical sync group or the
   `COMMON_SCRIPTS` set.
3. Contractor profile under `--profile=higher` (default: stay sonnet).
