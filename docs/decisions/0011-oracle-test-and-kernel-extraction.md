# 0011 — The Oracle Test, and extracting the Oracle Kernel

Status: Accepted
Date: 2026-07-24
Sharpens: [0004](0004-script-owned-mechanical-transitions.md) (which re-litigated [0002](0002-lean-orchestrator-intent-realignment.md)); this decision re-litigates the same seam from the opposite direction.

## Context

A script-necessity audit tested the thesis *"evidence + state files already make the
workflow resumable, so the runtime scripts are redundant."* The thesis **fails on its
reason** — resumability is not legitimacy. `repair-state.js` regenerating
`workflow-state.md` from the plan proves state is a *derived mirror*, but nothing in
re-reading files establishes that the position was *legitimately reached*. The thesis is
only ~5% right on its conclusion (~2,600 LOC of genuine string-formatting / projection /
dead code, tracked as separate follow-up).

The real finding was orthogonal and ~30× larger: **24.4% of the JavaScript in the repo
(77,394 of 317,143 LOC across `scripts/` + `plugins/`) is byte-identical duplication,
concentrated exactly in the irreducible primitives.** `kaola-workflow-adaptive-schema.js`
— which holds `writeFileAtomicReplace`, `acquireProjectLock`, `canonicalJson` /
`sha256Hex` and every digest primitive, the most irreducible content in the repo — exists
as four md5-identical copies (`cc5ba4eb…`, 3,978 lines each). Every invariant change is
paid four times; `CLAUDE.md` then mandates all four ~20–25-minute chains on any diff
touching those trees; and `validate-script-sync.js` + `edition-sync.js` exist partly to
police copies of copies.

The audit also established a fact that contradicts several stale code comments: **there
are no `PreToolUse` / `PostToolUse` hooks in any edition.** All six `hooks.json` carry only
`SessionStart` + `SubagentStart`; the interception hooks were retired in #372 and #725,
and `plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js` asserts they
must never return. Every lock, gate, and digest is entered *voluntarily* by an agent
obeying SKILL prose. **The scripts are consulted oracles, not guards.** Their value is the
*answer*, not the barrier — which means deleting a bypassable check is not free (it removes
the answer too), and for a bounded set of facts the script is the *only* source of the
answer.

## Decision 1 — The Oracle Test

0004's *"Agent Owns Reasoning; Scripts Own Atomicity"* is under-inclusive: it captures
`rename(2)` but misses digest bindings, spec-correct graph derivations, irreversible-act
journals, and fail-closed probe classification. Sharpen it to:

> **Keep a capability mechanical if and only if a _cooperating_ agent — full file access,
> unlimited turns, the rule written in front of it — would still produce a wrong answer it
> cannot detect.**

A capability stays mechanical only by naming one of four grounds:

- **U — unobservable.** The fact is in no file the agent can read: an OS test-and-set
  outcome, a crash interleaving, a concurrent process, a byte the agent did not write.
- **N — non-computable.** The answer needs a function the agent cannot evaluate by reading:
  sha256, canonical serialization, git tree identity.
- **S — spec-wrong.** The obvious derivation is a *different function* from the correct one
  and both look right. Canonical example, `next-action.js` transitive-ancestor readiness: an
  agent checking `depends_on` sees the sink's direct deps all `complete` after a repair reset
  an interior gate to pending, declares the sink ready, and finalizes past an un-passed
  post-dominating gate — a confidently wrong answer, not a slower one.
- **I — irreversible-ordered.** The act cannot be undone and its record must outlive the
  agent's own death (sink / release / replan step journals).

Two grounds are **disqualified**: *"the agent might forget"* (post-#725 a script cannot stop
a forgetful agent either; that is answered by contract prose plus a machine-authored evidence
trail) and *"the agent might cheat"* (interception was deliberately removed, putting it outside
the threat model). Anything defended only by those two words is a contract, not a script.

## Decision 2 — Extract the Oracle Kernel (physical-location change only)

The U/N/S/I primitives and the ground-S oracles named in #778 are consolidated into **one
canonical kernel source** in the repo, and the editions stop holding byte-identical copies.
**No logic moves — this is a physical-location change.** The ~101 typed `refuse()` reason
codes are a frozen cross-edition API for this change; behaviour stays byte-identical.

### Install model: one source, materialized at install (Option A)

Chosen over a single physically-shared installed kernel (Option B). The kernel lives **once**
in the repo (`scripts/kaola-workflow-adaptive-schema.js`, base-named — the one script
`renameNormalize` never rewrites). Each installer sources the kernel from that canonical path
and materializes it as a sibling inside the target edition's `scripts/` dir; the three
committed forge copies are removed and git-ignored, and `edition-sync --write` (which already
copies the byte-identical groups) materializes them locally before the forge test chains run.

Why Option A over Option B:

- **Runtime resolution is untouched.** Scripts already resolve the kernel as a `__dirname`
  sibling (`require('./kaola-workflow-adaptive-schema')`) across six scattered install roots
  (`~/.claude/…`, `~/.claude/kaola-workflow-{gitlab,gitea}/…`, `~/.config/opencode/…`,
  `~/.kimi-code/…`, repo `plugins/…`). Option A keeps that sibling model and the
  `resolveRuntime()` path-shape detection exactly as-is. Option B would require a new
  cross-root require mechanism and likely changes to runtime detection.
- **No cross-edition runtime coupling.** Each installed tree stays self-contained (its own
  materialized kernel), preserving *Self-Sufficient by Default*. Option B couples the
  editions (reinstalling one edition's kernel affects all) for no gain the measured ACs need.
- **Lowest risk on the repo's most expensive change.** A botched extraction is exactly the
  cross-edition-drift class `edition-sync.js`'s own header warns about — the failure that can
  survive all four chains. Option A minimizes the moving parts.

### Consequence: the four-chain frequency drops for kernel changes

With the kernel a single canonical file and no committed forge copies, an invariant/primitive
change touches **one file**, not four trees — enabling a kernel-only change to be verified by
**the claude chain alone** (~5–6 min vs ~20–25 min). This is *safe*, not a weakening: there are
no copies left to drift, the kernel is layout-agnostic (pure digests / lock / atomic-write), and
the claude chain already materializes + loads the forge ports through `validate-script-sync`, so
passing in one layout is proof for all. A *forge-wiring* change still requires all four.

This frequency win is delivered by a **fast-follow, not this extraction.**
`run-chains.js`'s `isEditionCouplingPath` classifies a `scripts/*.js` change as edition-coupling
by `fs.existsSync(plugins/kaola-workflow/scripts/<same>)` — and post-extraction the codex mirror,
though git-ignored, is *materialized on disk*, so `existsSync` still returns true (fragilely:
depending on whether a materialize ran). Making a kernel change claude-sufficient therefore needs
an explicit kernel special-case in that classifier — a chain-scope logic change deliberately kept
OUT of the pure byte-identical extraction (this issue's "no logic changes / land alone"
constraint) and landed separately with a non-vacuous test proving the flip. Until then a kernel
change is scoped conservatively; both outcomes (all-four, or claude-only) are safe.

## Never migrate (closed list)

Recorded so a future sweep does not re-open them: the sink / release / replan step journals,
barrier baselines as git refs, transitive-closure readiness, case-folded write-set
disjointness, every fail-closed unreadable-probe classification, the recomputed digest
bindings, and `provenance-log.jsonl` as machine-authored evidence. These are the answers the
oracle uniquely provides; deleting them forfeits the answer.

## Sequencing with #777

#778 moves the ledger's *primitives* into the kernel; #777 (next) builds ledger
tamper-evidence *on* the kernel. The two are compatible and deliberately ordered kernel-first
(the #777 hash-chain reuses the kernel's digest primitives). #776 (durable evidence writes)
already landed, satisfying #778's precondition that weight not shift onto "evidence is durable"
while a bare `fs.writeFileSync` remained.

## Verification

Behaviour byte-identical; `test-mega-mutation-spotcheck.js`'s five historical bug shapes stay
red after each step; the duplicate-LOC md5 census drops materially from 77,394 and is recorded
in the closing evidence; `validate-script-sync.js`'s kernel byte-identical group retired;
install verified for all four forges plus opencode and kimi; four chains green with the receipt
taken at the commit. Land alone — nothing else in the diff.
