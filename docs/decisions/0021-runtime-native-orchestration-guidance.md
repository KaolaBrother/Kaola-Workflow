# ADR 0021 — Runtime-native orchestration guidance

Status: Accepted · Date: 2026-08-27 · Issue: #1035

## Context

ADR 0020 made `AGENTS.md` and the role behavior contracts runtime-neutral, but the accompanying
subtraction removed too much from `workflow-next` and `kaola-workflow-finalize`. The generated role
profiles still knew most runtime paths, carriers, and tier mappings; the commands that choose and
dispatch those roles no longer exposed that knowledge. A runtime could therefore mistake one
missing custom role for the absence of all child routes, or turn one cohesive production item into
a run-wide inline policy.

The universal decision and the runtime mechanism are different concerns. Every runtime needs the
same three intent classes and the same per-item dispatch principles, but it discovers profiles,
launches children, carries model/effort, and exposes built-in routes through different native
mechanisms. Those differences belong in the adapter, not in universal prose and not in a
Claude-shaped transform.

## Decision

### Common judgment, native mechanism

The universal contract keeps exactly three intent classes: `standard`, `reasoning`, and `heavy`.
It also keeps one execution principle: choose dispatch or inline again for every mission item. A
missing exact named role is evidence about that route for that item; it is not evidence that all
native dispatch is unavailable, and it cannot establish a run-wide inline posture.

One owner may retain a cohesive production surface when handoff and integration cost dominate. That
scope does not absorb independent research, acceptance authorship, documentation, or review work.
Kaola sets no dispatch count, parallelism cap, nesting policy, required pipeline, or prohibition on
automatic/background/resume/task-sensitive choices that the active runtime genuinely supports.

Each runtime adapter exposes, for both `workflow-next` and `kaola-workflow-finalize`:

- native profile locations and the precedence or reload boundary that matters to use;
- the native dispatch carrier and only its verified fields;
- all three default model/effort bindings or the truthful inheritance behavior;
- the native tool or permission boundary;
- named, built-in, and generic routes that are actually available, with their limitations; and
- relevant native background, parallel, resume, nesting, session, or cold-start facts.

Cursor and ZCode do not publish a complete Task/Agent call schema. Their adapters therefore direct
the orchestrator to the schema and type catalog exposed by the current session instead of inventing
portable fields. Runtime-specific facts remain evidence-bound and may be `unknown`.

### Default tier bindings, not a scheduler

ADR 0019's owner-approved matrix remains the default dispatch binding:

| intent | Claude | Codex | OpenCode | Kimi | Grok | Cursor | ZCode |
| --- | --- | --- | --- | --- | --- | --- | --- |
| standard | `sonnet`, runtime effort | `gpt-5.6-luna` / `max` | session; optional standard model pin | session model/thinking | inherited model + profile `medium` | profile `grok-4.6[effort=medium]` | profile `GLM-5.3` / `thoughtLevel: high` |
| reasoning | `opus`, runtime effort | `gpt-5.6-sol` / `medium` | optional reasoning-role model pin, otherwise session | session model/thinking | inherited model + profile `high` | profile `grok-4.6[effort=high]` | profile `GLM-5.3` / `thoughtLevel: max` |
| heavy | `fable`, runtime effort | `gpt-5.6-sol` / `high` | classifies with reasoning for the optional pin, otherwise session | session model/thinking | inherited model + profile `xhigh` | profile `grok-4.6[effort=xhigh]` | profile `GLM-5.3` / `thoughtLevel: max` |

These are defaults and capability facts, not a hard ban on a runtime-supported task-sensitive
choice. The carrier is runtime-native: Claude and Codex may select the default on a call; OpenCode
has no per-call model/effort field; ordinary Kimi profiles inherit unless the user explicitly opts
into its experimental secondary-model pool; Grok effort and Cursor/ZCode tiers live in profiles.
Kaola does not silently enable a user-owned experimental feature or overwrite a runtime choice.

### Honest fallback

When an exact Kaola role is unavailable, inspect the active runtime's built-in, generic, and other
native child routes for the current item. A route is adequate only if its actual mechanism can meet
the task, custody, evidence, and stop boundaries. The brief may assign those boundaries, but it does
not rename a generic worker into `tdd-guide`, `code-reviewer`, or another missing custody-bearing
role. If no adequate route exists, execute that item inline, record the specific `capability_gap`,
and re-evaluate the next item.

Cursor demonstrates why the live catalog wins. Its IDE documentation describes scoped `Explore`,
`Bash`, and `Browser` routes, while the supported Cursor CLI 2026.08.11 live probe exposed writable
`generalPurpose`, specialist built-ins, and project custom types—but not those three scoped types.
The adapter exposes both as host-dependent facts and never hardcodes either catalog as universal.
`generalPurpose` remains `subagentType.unspecified`; a custody brief does not rename it.

### Generated authority

`templates/agents/runtime-capabilities.json` is the machine authority for this routing-only
guidance. `scripts/generate-agent-profiles.js` renders one marked block; the
`runtime-delegation` routing slot places the Claude block in command surfaces and the forge-matched
Codex block in skill surfaces. The five additive edition transforms replace that marked block with
their own adapter render for `workflow-next` and `kaola-workflow-finalize`. `workflow-init` does not
carry dispatch teaching.

The same adapter file still feeds native role profiles, but routing-only guidance is excluded from
`resolved_profile_hash`. Editing orchestration explanation therefore regenerates next/finalize
surfaces without pretending the native profile bytes changed. Structural markers, adapter lookup,
and mutation reachability are tested; generated commands and skills remain outputs, not authoring
surfaces.

## Consequences

- A Kaola-formatted repository remains switchable among all supported runtimes through universal
  `AGENTS.md` plus the smallest native bridge where one is required.
- Each runtime sees more of its real capability surface, not a lowest-common-denominator scheduler.
- The same mission may dispatch through different native carriers while preserving task, custody,
  evidence, and stop boundaries.
- Profile discovery or one named-role failure becomes a local routing fact, never a global verdict.
- New runtime capabilities are exposed additively after evidence; Kaola does not constrain them in
  anticipation of failure.

## Supersession

This ADR refines ADR 0020. ADR 0020 remains authoritative for AGENTS-first project instructions,
one behavioral source, provenance, migration, and native profile generation. This ADR supersedes
its statements that intent expresses no default per-spawn binding, that routing commands select no
model/effort pair, and that restoring runtime-native default routing is categorically rejected.

ADR 0019's three intent classes and owner-approved runtime binding matrix remain active as the
default dispatch policy, while this ADR replaces its Claude-shaped rendering details. ADR 0017's
mission-list architecture and ADR 0018's forge-as-backlog decision remain unchanged.

## Rejected alternatives

- One generic dispatch paragraph for every runtime.
- A run-wide inline fallback after one named role is absent.
- Prompting a generic child to impersonate a custody-bearing named role.
- Inventing Cursor or ZCode call fields that their public contracts do not publish.
- Treating tier defaults as a ban on native task-sensitive choices.
- Adding Kaola-owned concurrency, nesting, background, resume, or scheduler limits.
