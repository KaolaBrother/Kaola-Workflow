# ADR 0023 — Agent-owned project instructions

Status: Accepted · Date: 2026-08-31 · Issue: #1047

## Context

ADR 0022 moved universal workflow behavior from each repository into measured machine-global
carriers. The remaining repository prompt was still produced by a fixed template and migrated by a
script that classified byte ownership. That mechanism added headings and placeholder values even
when a repository already carried the same project facts in useful owner-authored prose.

The measured failure was not a missing classifier case. It was the ownership model itself: project
purpose, commands, tests, documentation, and constraints require repository understanding, while a
template can only prescribe a shape. On the financial-agent fixture, the released migration reduced
129 lines to 106 but duplicated facts and introduced placeholder `unknown` values; an owner-guided
Agent rewrite reached 62 lines while preserving the verified project contract. The line reduction is
evidence, not a target or gate.

## Decision

1. Root `AGENTS.md` is Agent-maintained project content. It carries verified repository facts and
   stricter local constraints, not a distribution-authored prose block.
2. `workflow-init` specifies the outcome: inspect the repository; establish current purpose,
   commands, tests, documentation, and constraints; consolidate duplication; and maintain the
   smallest useful instruction surface.
3. The Agent chooses headings, order, wording, and length. There is no project-prompt template,
   marker protocol, canonical byte sequence, placeholder schema, writer helper, or producer-repo
   exception.
4. Existing owner-authored instructions require owner authorization before rewrite. Authorization
   permits semantic editing; it does not prescribe the result.
5. Claude's root `CLAUDE.md` remains the smallest discovery bridge: one `@AGENTS.md` import plus
   genuine Claude-only project facts. Other runtimes read `AGENTS.md` directly within their measured
   scopes.
6. The machine-global contract receipt is verified read-only. Runtime installers continue to own
   machine/user commands, skills, profiles, hooks, adapters, receipts, and dedicated Rule carriers;
   that evidence grants no ownership of repository instructions.
7. If an Agent edits instructions already loaded by the active session, it records the relevant
   fresh-session or documented native reload requirement. Scripts do not decide semantic
   compatibility or freeze project prose.

## Validation boundary

Mechanical tests may prove that retired writer artifacts and markers are absent, a bridge resolves,
required product facts remain discoverable, and documentation links exist. They may not require a
heading set, field order, line or byte threshold, canonical wording, or exact prompt hash. Prompt
sufficiency is checked by a fresh Agent/session against the intended repository behavior.

Repeated `workflow-init` is idempotent by judgment: when repository evidence and owner direction have
not changed, there is no reason to edit. It is not byte convergence enforced by a renderer.

## Consequences

- Existing owner-only project instructions are a normal supported state rather than an ambiguous
  migration class.
- Adding a project fact no longer requires extending a distribution schema.
- Agents must read before writing, and reviewers judge whether verified facts were preserved rather
  than whether prose matched a template.
- Repository instruction differences across projects are expected. Universal workflow behavior and
  measured runtime differences remain centralized in their existing global and adapter authorities.
- Active sessions may require a restart or reload after self-editing instructions; this is visible
  runtime lifecycle, not hidden migration state.

## Supersession

This decision supersedes ADR 0020's project managed-region and consumer-migration clauses and ADR
0022's clauses that allowed exact old project templates to migrate through a script. ADR 0020's
direct-discovery, thin-bridge, role-behavior, adapter, and provenance decisions remain active. ADR
0022's machine-global contract, transaction, and compact-recovery design remain active.

## Rejected alternatives

- Make the fixed template shorter: it still gives a script ownership of semantic project facts.
- Build a smarter fact extractor: heuristics would turn uncertain interpretation into repository
  mutations and recreate an expanding schema.
- Keep markers only for ownership: ownership of project prose belongs to the repository and Agent;
  dedicated runtime carrier ownership is already separately receipted.
- Use a line, byte, or heading budget: measurements help review but are not a proxy for sufficiency.
- Rewrite existing owner content without consent: semantic maintenance does not remove the owner's
  authority over an existing instruction surface.
