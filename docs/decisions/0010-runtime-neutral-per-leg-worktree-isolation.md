# 10. Runtime-neutral per-leg `.kw` worktree isolation + a synthesizer-resolved commit barrier

Date: 2026-06-15
Status: Accepted
Issue: #463 (expanded redesign; the write-overlap half of the D-419 speculative-execution kernel #439 deferred)
Relates-to: `docs/decisions/0008-excise-write-role-batch-isolation.md` (the machinery this **fulfills, not reverses**),
`docs/decisions/0005-plan-run-owns-node-lifecycle.md` (the per-node lifecycle the leg scheduler sits under),
#376 (write-lane containment PreToolUse hook) + #377 (per-node running-set scheduler) — the two reintroduction
vehicles ADR-0008 named, #439 (the read-side speculative kernel whose consent-carrier + discard primitive the
leg scheduler reuses), `reference_no_env_var_subagent_detection` (the constraint that forces containment over
construction).

## Context

Write fan-out has always serial-degraded: the #377 running-set scheduler degrades any overlapping write
frontier to a serial open, and `kaola-workflow-parallel-batch.js` emits `{degraded: true,
reason: 'cwd_unenforceable'}`. The repo's own `scripts/` — the most common real fan-out target — could
therefore never fan out, because every script lives under one coarse area. #463 makes a ≥2-wide write level
fan out into per-leg worktrees and reconcile them through a synthesizer + a commit barrier, **without ever
sacrificing accuracy** and **without forking isolation per runtime**.

Three decisions had to be settled before the runtime could be built. This ADR records them.

## Decision

### 1. This **fulfills** ADR-0008; it does not reverse it.

ADR-0008 excised `parallel-batch.js`'s write-role **member-worktree** isolation path (per-member
`git worktree add --detach`, seeded snapshots, per-member plan copies, a tree-aware `join`) because it was
**unreachable by default and non-functional if forced** — and it explicitly **tracked its reintroduction**
through #376 (the write-lane hook) and #377 (the per-node running-set scheduler). #463 is that reintroduction,
done correctly: per-leg `.kw` worktrees provisioned by the **scheduler** (not the batch mechanism), under the
per-node running-set lifecycle (ADR-0005), gated off by default (`KAOLA_LEG_ISOLATION` + a per-run
`--write-overlap-consent`) and **byte-identical when off**. The excised machinery was a batch-shaped dead end;
the leg machinery is a scheduler-shaped, fail-closed mechanism with a per-leg barrier, a parent-clean fence,
and a synthesizer commit barrier. ADR-0010 **instantiates** the isolation ADR-0008 deferred — it is not a
reversal of the excision.

### 2. Legs live under `.kw/legs/`, a sibling of the workflow worktree.

Each parallel write leg is a plain `git worktree` at `.kw/legs/<project>/<node>`, branched off the feature
HEAD on `kw/legs/<project>/<node>`. The path is load-bearing:

- It is under `.kw/`, which is **gitignored** from the main repo, and it is a **sibling** of (not nested
  inside) the workflow worktree's directory — so the parent barrier's `snapshotWorktree(root)` (`read-tree
  HEAD` + `git add -A`) **never sweeps a leg's untracked checkout into the parent's diff** (the silent-corruption
  trap a nested leg would spring).
- All worktrees share one `--git-common-dir`, so a leg's commits are visible to the synthesizer **by ref** in
  the parent — the script-owned capture commits each leg branch and hands the synthesizer the refs.

This is the **same `.kw/` substrate** the project already provisions its one workflow worktree in
(`worktreePathFor`, `claim.js`), so Claude Code **and** Codex drive it identically with plain `git`.

### 3. We reject Claude-only `isolation:'worktree'` for neutrality — isolation is **containment, not construction**.

Claude Code's Agent-tool `isolation:'worktree'` would give *transparent* isolation (the subagent's process is
physically in a per-agent worktree at `.claude/worktrees/<name>/`). We **reject** it: it is **Claude-only and
harness-owned**, Codex has no equivalent, and `.claude/worktrees` is not the shared substrate the editions
co-operate in. Using it would fork isolation per-runtime and relegate the three Codex surfaces to permanent
serial-degrade — a violation of the same neutrality principle behind the byte-identical schema and the ×4
chains. The Agent tool exposes **no `cwd`/`working_directory` parameter**, and there is **no env var that
identifies which subagent made a tool call** (`CLAUDECODE`/`SESSION_ID`/`AI_AGENT` are byte-identical in main
and dispatched contexts). Therefore per-leg isolation is achieved by **fail-closed containment, not transparent
construction**:

- **Absolute-path agent briefs** (the discipline): each leg agent is dispatched with its absolute `legPath` —
  every `Edit`/`Write` uses an absolute `<legPath>/...` path, every Bash uses `cd "<legPath>" &&`.
- **The per-leg barrier** (every runtime): the leg's diff vs its branch-point ⊆ its declared write set — the
  genuine per-node attribution check + the real cross-lane containment enforcer.
- **The parent-clean fence** (the own-lane catch the barrier + hook structurally miss): before the synthesizer
  merges a level, the parent worktree must be clean of production paths; a floated own-lane slip surfaces as a
  dirty parent → `merge_conflict`/repair.
- **The write-lane hook** (#386): a coarse, best-effort cross-lane fence (Claude only) — explicitly *not* the
  per-node guarantee.

The failure mode is **denied / overflowing / floated writes caught fail-closed and repaired**, never silent
cross-contamination or silent loss. Implementers must know they are getting **containment, not construction** —
we traded the only transparent mechanism away for runtime neutrality, on purpose.

## Consequences

- A ≥2-wide write frontier of genuinely-disjoint files fans out into per-leg `.kw` worktrees, reconciled by a
  **mechanical octopus merge** (no agent for the disjoint case — the clean win) and verified by a **commit-based
  union barrier** on the merge commit M (`diff-tree base M ⊆ union`, with base + every leg head ∈ ancestors(M)
  — the B1 fix: a working-tree snapshot would false-green a floated slip). A real same-file conflict (the
  deferred tier, freeze-refused today) dispatches the reasoning-class **`synthesizer`** agent (Opus floor,
  non-lowerable) to resolve **by intent**, bounded by the K=3 repair cap → `merge_conflict` halt.
- Correctness is never traded for parallelism: the per-leg barrier + the parent-clean fence + the commit-union
  barrier + the terminal four-chain are the landing gates; a clean merge is a weak signal, never a pass.
- The validator relaxes write-set serialization from **PREVENT to DETECT-AND-REPAIR**, but only when a
  synthesizer + a downstream review gate post-dominate the legs, the `write_overlap_policy` tier authorizes the
  overlap class, **and** a per-run consent is present. Absent those, today's refusals stand verbatim — the
  fail-closed floor. Gated off by default (`KAOLA_LEG_ISOLATION` off ⇒ byte-identical serial-degrade).
- The mechanism is **runtime-neutral**: the same scripts + the same `.kw/` substrate are driven by Claude Code
  and Codex; the three Codex surfaces are not relegated to serial-degrade.
- This is the **write-overlap half** of the D-419 kernel #439 deferred: optimistic open → anchored-baseline
  rollback on failure → typed operator surface (`merge_conflict`), sharing #439's consent-carrier + discard
  primitive at the kernel level while keeping a distinct `write_overlap_policy` field.
