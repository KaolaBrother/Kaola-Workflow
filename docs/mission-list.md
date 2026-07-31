# The mission list

One file per run. Four fields per item. Three write moments.

This is the whole coordination mechanism. It exists because of one observed failure: an orchestrator
running subagents from context alone lost every subagent at once to a usage limit, and with them
**what was in flight** and **what remained to do**. Content survived — git already is the content
record. Coordination state did not, because it lived only in a process.

So: coordination state lives where content already lives — on disk.

## Where the file lives

`kaola-workflow/<run>/mission-list.md`, one folder per run, archived to `kaola-workflow/archive/<run>/`
when the run ends. A run named after an issue uses `issue-<N>`.

Nothing else is required to be durable. No script writes this file; the orchestrator does.

## The format

```markdown
# <the goal, one line>

- item: <the mission, one line of prose>
  status: todo

- item: <the mission>
  status: in-flight
  dispatched: <what went out and to whom>

- item: <the mission>
  status: done
  dispatched: <what went out and to whom>
  result: <where the outcome landed — a path, or a few lines inline>
```

| field | content | written |
|---|---|---|
| `item` | the mission — one line of prose, hints and facts | at creation |
| `status` | `todo` \| `in-flight` \| `done` | on change |
| `dispatched` | what went out and to whom, enough to decide re-dispatch vs. wait | at dispatch |
| `result` | where the outcome landed — a path, or a few lines inline | at close |

The H1 carries the goal. Items are identified by their order in the file; nothing depends on a
stable ID. Fields appear in the order above and absent fields are simply absent — a `todo` item has
no `dispatched`, an `in-flight` item has no `result`.

Items may be added at any time. The frontier is not computed: it is the list minus done minus
in-flight, visible by reading.

## The three write moments

1. **Created** — write `item` and `status: todo`. New work discovered mid-run is appended the same way.
2. **Dispatched** — write `dispatched` and flip `status` to `in-flight`, *before* the work goes out.
   Writing it after is the failure this file exists to prevent.
3. **Closed** — write `result` and flip `status` to `done`.

Work the orchestrator does itself is still an item: it goes `in-flight` with `dispatched: self`.

## An item is a mission, not a specification

An item carries no role, no write set, no dependency edge, no model, no cardinality, no shape. It is
one line of prose: what to achieve, plus hints and facts already known. When the orchestrator reaches
an item it decides **then** whether to dispatch subagents or do the work itself, and at what width.

Carrying evidence is the point; dictating a conclusion is not. `investigate whether X still holds —
the claim is at foo.js:120` is an item. `run agent A then agent B, writing exactly these files` is a
schedule, and schedules belong to the orchestrator at dispatch time, not to the file.

## Resuming

A successor with no context reads the file top to bottom:

- the H1 is the goal;
- `done` items with their `result` are what is already known;
- `in-flight` items with their `dispatched` are the decision to make — re-dispatch, or wait for
  something still alive;
- `todo` items are what remains.

That is the entire recovery procedure. If an `in-flight` item's work turns out to have completed
after all, its `result` is recoverable from git and the item closes normally.

## What is not here

There is no plan grammar, no freeze, no gate, no disjointness check, no fan-out cap, no serializer
evidence, and no refusal. Concurrency is the orchestrator's call, uninspected — the frontier is
visible and the agent decides how much of it to open.

Tools stay tools: subagents and worktrees are offered and declinable. A tool the agent cannot decline
and still finish is a gate wearing a tool's name.

## The sink

When work merges, the sink **reports** what it found — content on the branch that no record
describes, a merge that did not fast-forward — and the orchestrator resolves it: get the merge
correct, resynchronize, or file a PR, then clean up after. The sink does not refuse; the orchestrator
is accountable for the branch ending up right.
