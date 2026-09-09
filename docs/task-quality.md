# Task quality

How to express a task in a forge issue so an Agent can proceed without a fixed requirement
template. There is no separate schema for this: it is guidance for the existing `/workflow-next`
route, generated from `templates/routing/next.skeleton.md`.

## What a task needs

State three things in the issue, in plain language:

- The situation: what is true now, and what breaks or is missing.
- The intended observable outcome.
- The acceptance basis: what evidence would show the outcome was reached.

When those are already clear and authorized, the route continues rather than demanding a fixed
requirement format or a restated issue. When a fact is missing, the Agent reads the code,
reproduces the problem, or looks it up first; only an unresolved choice that would change scope,
authorization, or the meaning of acceptance goes back to the user. This is the operative rule from
the Next route's "Task clarity" paragraph:

> **Task clarity.** When the intended outcome and its acceptance basis are already clear and
> authorized, continue: do not demand a fixed requirement format or rewrite the issue to restate it.
> When a fact is missing, read the code, reproduce, or look it up first; implementation detail
> inside an authorized scope is your own judgment. Ask the user only about an unresolved choice that
> would change scope, authorization, or the meaning of acceptance, and keep doing the investigation
> that does not depend on the answer. When authorized to maintain the issue, express the observable
> outcome and its verification basis in plain language, and cite what is already sufficient instead
> of restating it. A research or design request authorizes research or design only; it does not
> authorize product implementation, forge writes, or a claim.

Note the last sentence: a request for research or design authorizes research or design only, not
implementation, forge writes, or a claim.

## Splitting work

Prefer splitting a task by independently acceptable outcomes: each split piece should be checkable
on its own evidence. Keep real shared dependencies together instead of splitting them apart — for
example, a shared contract or schema that several pieces depend on runs as one item, which is
already the Next route's rule.

## A worked example

A one-line permission fix does not need an extra requirement sheet or a routine confirmation step.
It still needs evidence: the previously unauthorized path is now refused, the legitimate access
still works, and the surrounding regressions still pass. A short explanation does not lower
acceptance for a small change.

Verification strength follows behavioral impact and the existing mandatory chains, not the size of
the explanation. This is the operative rule from the Next route's "Run it" section:

> ...Decide how much to explain by what communication needs, and how much to verify by behavioral
> impact and the existing requirements; a short explanation or a small change never lowers
> acceptance, and sufficient existing evidence may be cited rather than reproduced.

PASS evidence for the exact bytes it was measured against is invalidated by any later mutation of
those bytes. An unexecuted environment, device, service, or user-acceptance check is never reported
as PASS.

## Where corrections go

Kaola-Workflow already has a place for every kind of correction; a task guide does not add new
mechanisms:

- A wrong premise in the original requirement gets a correction comment on the original issue —
  later comments with explicit corrections win over the original body.
- A proven defect gets a fix plus a meaningful regression test.
- A durable project fact belongs in existing documentation: README, `docs/`, or project instructions
  maintained under [ADR 0023](decisions/0023-agent-owned-project-instructions.md), which requires
  owner authorization before rewriting existing owner-authored text.
- An architecture choice gets an ADR when one is needed.

Unproven suspicions and one-off handling stay local to the issue; they do not become standing rules.
There is no learning loop, no diary or knowledge base, no automatic rewrite of owner instructions, no
personal-memory write, and no routine "anything to remember?" prompt in init or finalize.

## Related

- [ADR 0017 — the Mission List](decisions/0017-the-mission-list.md): the design of record for how a
  claimed run is decomposed into recoverable items.
- [ADR 0023 — Agent-owned project instructions](decisions/0023-agent-owned-project-instructions.md):
  how durable project facts are maintained without a fixed template.
