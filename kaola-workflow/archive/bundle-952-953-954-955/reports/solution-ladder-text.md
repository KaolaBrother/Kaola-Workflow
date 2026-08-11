# The authored solution ladder — canonical bytes

This file is the single authored wording for #953. Every carrier renders from the block below.
Do not paraphrase it, do not re-wrap it, do not adapt it per role. If it is wrong, it is fixed here
and re-rendered.

The pin sentence is **"Reuse or extend an existing mechanism before writing a second one."** — 66
characters, comfortably over the parity guard's `MIN_RULE_CHARS = 48`, and the rung most likely to be
silently dropped in a hand-written mirror.

## For the three canonical Markdown files (`agents/{implementer,code-architect,planner}.md`)

Append as a new H2 section. Verbatim:

```markdown
## Solution ladder

Climb only as far as the problem forces, and stop at the first rung that works.

1. **Nothing.** A part of the brief that only speculates about a future need is a finding, not a
   build. Report it and move on.
2. **What is already here.** Reuse or extend an existing mechanism before writing a second one.
3. **The standard library.**
4. **A dependency the project already installs.** A new dependency is not a rung — it is an
   escalation to whoever assigned the work.
5. **The minimum code that works.** No abstraction with a single implementation, and no option
   nobody asked for.

A corner cut deliberately is written down where the work lands: what it does not cover, and what
would force it to change.

This governs the solution you build, never how closely you read or verify — comprehension and
verification stay exactly as demanding as they were.
```

## For the nine Codex TOML carriers (`plugins/{kaola-workflow,-gitlab,-gitea}/agents/*.toml`)

Same rungs, same pin sentence, rendered into the TOML files' existing prose register. The pin
sentence must appear **verbatim**. Verbatim block to insert into each profile's instruction body:

```
Solution ladder — climb only as far as the problem forces, and stop at the first rung that works.
(1) Nothing: a part of the brief that only speculates about a future need is a finding, not a build.
(2) What is already here: Reuse or extend an existing mechanism before writing a second one.
(3) The standard library.
(4) A dependency the project already installs — a new dependency is not a rung, it is an escalation
to whoever assigned the work.
(5) The minimum code that works: no abstraction with a single implementation, and no option nobody
asked for.
A corner cut deliberately is written down where the work lands: what it does not cover, and what
would force it to change. This governs the solution you build, never how closely you read or
verify — comprehension and verification stay exactly as demanding as they were.
```

## Harmonization required by the issue

`agents/code-architect.md:40-41` currently carries the second wording:

```
- choose the simplest architecture that meets the requirement
- avoid speculative abstractions unless the repo already uses them
```

These two bullets are **replaced** by the ladder — their content is rungs 5 and 1 respectively. The
adjacent line `:35` ("understand the dependency graph before proposing new abstractions") is about
*reading*, not solution size, so it **stays**.

## Constraints this text was written against

- **No vendor, no model, no origin.** Agent-facing text carries the rule, never its provenance.
- **The ladder governs the solution, never the reading.** The closing sentence says so explicitly,
  because both `code-architect` and `implementer` carry comprehension/verification demands that this
  section must not appear to relax — `implementer`'s "correct for every valid input, not just for the
  inputs the tests name" in particular.
- **Pinnable.** One sentence ≥ 48 normalized characters, identical in Markdown and TOML.
- **Not a sixth wording.** Five live wordings were measured. This replaces `code-architect`'s and is
  the shared text for all three roles. `build-error-resolver`'s fuller ladder and `CLAUDE.md`'s own
  clause are out of #953's scope and are deliberately left alone.
