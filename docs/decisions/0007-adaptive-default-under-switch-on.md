# 7. Adaptive path is the default route under an ON switch; install switch defaults ON

Date: 2026-06-09
Status: Accepted
Issue: #254
Supersedes: the *selection / "a custom graph must earn itself"* portion of
`docs/decisions/0003-adaptive-front-end-planner.md` and the #227 structure-question
selection gate. (ADR 0003 itself is not edited; this record supersedes those portions
only.)

## Context

ADR 0003 established the adaptive front-end planner and introduced the install switch
(`enable_adaptive`). Under that design the adaptive path had to "earn itself": a
level-4 structure-question rubric was required before adaptive could be selected, and
the keyword lists treated `adaptive` as a *flag-only* token — not a named path the
user could request explicitly. A user who typed "adaptive" was silently downgraded to
`full`. The install switch also defaulted OFF, so the path was opt-in at install time
and absent from path selection unless the user had previously run
`./install.sh --enable-adaptive=yes`.

Two problems emerged from that design:

1. **The earning gate is the wrong abstraction.** The adaptive DAG planner subsumes
   the linear planner: a linear job is just a degenerate sequence DAG. There is no
   principled threshold for "is this issue non-linear enough to deserve a DAG?" — any
   such gate invites false negatives (the planner is blocked from composing a
   better-fit plan for a nominally simple issue) and false positives (the gate score
   itself becomes a source of non-determinism). The right default, once the machinery
   is mature enough, is simply to route through the planner and let the planner decide
   on shape.

2. **Silent downgrade on explicit request is user-hostile.** When a user explicitly
   names "adaptive" and the system silently picks `full`, the user has no feedback
   that the override happened. The typed-refusal convention used elsewhere
   (e.g. `KAOLA_PATH=adaptive` under an OFF switch) is the right model: fail visibly
   or succeed visibly, never silently reroute.

## Decision

1. **Adaptive is the default route under an ON switch.** In `/workflow-next` Step 0a-1,
   when `enable_adaptive` is ON, the adaptive path is selected by default — `fast` and
   `full` are reachable only by an explicit path-naming request or an explicit
   `KAOLA_PATH=fast`/`KAOLA_PATH=full`.

2. **The install switch defaults ON.** A bare `./install.sh` now writes
   `enable_adaptive:true` to `~/.config/kaola-workflow/config.json`. The opt-out is
   `--enable-adaptive=no`, which actively writes `enable_adaptive:false` so the
   opt-out survives a re-install over a stale `:true` config. Existing installs
   change on the next `./install.sh` invocation.

3. **The level-4 structure-question rubric and the flag-only adaptive keyword list
   are retired under an ON switch.** Under OFF, the legacy two-way fast/full picker
   and full default are unchanged byte-for-byte.

4. **Rationale for retiring the rubric.** The DAG planner subsumes the linear planner.
   A linear job is a degenerate sequence DAG; the planner can compose a plan of any
   shape including a single-node sequence. There is no separate "is this big enough
   for a DAG?" gate to get wrong, and removing it eliminates a class of misrouting
   while costing nothing — the planner still produces a fast-like sequence when the
   issue calls for it.

## Invariants preserved

- **Switch-OFF is unchanged.** Under an OFF switch, behavior is byte-for-byte identical
  to pre-#254: legacy two-way fast/full picker, `full` as the default, and
  `KAOLA_PATH=adaptive` is a typed refusal, never a silent downgrade.

- **Kill-switch intact.** The resolution floor stays `env > config > OFF`. Setting
  `KAOLA_ENABLE_ADAPTIVE=0` disables the adaptive path for that session regardless of
  config. An absent or cleared config is still OFF. Only the install-written default
  now produces `:true`.

- **Toggle-agnostic plan execution.** A frozen `workflow-plan.md` finishes even if the
  switch is later turned off mid-run (unchanged from the original adaptive design).

## Open caveats at decision time

- **#296** (adaptive/finalize: worktree finalize is not crash-resumable —
  `cmdFinalize` commits the archive before the implementation commit) — open as of
  this decision.
- **#303** (adaptive: end-to-end parallel fanout with rolling bounded dispatch) —
  resolved in v5.9.0; recorded here as context for the GA maturity picture at the
  time this default flip was made.

## Consequences

Positive:

- Adaptive is used on every issue once the switch is on, so the planner and per-node
  machinery accumulate real-world usage at a higher rate. Gaps surface faster.
- Users who explicitly ask for "adaptive" get what they asked for rather than a silent
  downgrade.
- The earning-gate false-negative problem is eliminated: the planner can now compose
  a sequence DAG for a simple issue without the issue having to "qualify" first.

Negative:

- Adaptive is the default even when the issue is trivially linear; the planner adds
  one front-end Opus dispatch per fresh run. For short issues this is a non-zero cost
  with no structural benefit over fast (the planner will produce a sequence plan, but
  the overhead is real).
- Existing installs that relied on the switch defaulting OFF will find the switch ON
  after their next `./install.sh`. This is intentional (install-time change) but
  operators should be aware.
- The contract for "opt out" changes: previously omitting `--enable-adaptive` kept the
  switch off; now it must be stated explicitly as `--enable-adaptive=no`.
