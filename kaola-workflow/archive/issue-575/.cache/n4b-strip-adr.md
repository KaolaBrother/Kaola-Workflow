evidence-binding: n4b-strip-adr ebd1cbd5feac
# n4b-strip-adr — evidence (plan-repair node)

Scope-gap repair: the plan's own GOAL lists "ADR refs," but the scope re-grep pattern omitted ADR, so ADR-only files never entered a write set. This node strips `(ADR 0004)` (a decision-record citation, same class as D-NNN-NN) from the fast/full-path command + skill files.

## Changed files (30; verified within declared set)
Claude commands fast+phase1-5 (6), gitlab commands fast+phase1-5 (6), gitea commands fast+phase1-5 (6), codex skills plan/execute/ideation/review (4), gitlab skills same (4), gitea skills same (4). 31 removals total (gitea execute had 2).

## Form
Every occurrence was a pure-provenance parenthetical ` (ADR 0004)`. Deleted preceding space + parenthetical, kept adjacent punctuation. No clause needed rewriting; none mixed provenance with meaning. Examples:
- `...full-advance.js` (ADR 0004), not a subagent.` → `...full-advance.js`, not a subagent.`
- `...adaptive path (ADR 0004): the main` → `...adaptive path: the main`
No `#NNN`/`D-NNN-NN`/`[INV-NN]` present in these files (phase2-5 were clean apart from ADR).

## Global completeness (all agent-facing prompt surfaces, post n1-n4b)
Line-level residual provenance = ZERO. The only surviving pattern-matches are allowed forms: `#42 #47 #53` user-command examples (workflow-next command/skill) and the `# Workflow Plan — issue #142` plan-template example (adapt skill) — illustrative variable forms, kept by design.

## Functional tokens / forge nouns / symmetry
All script names (kaola-workflow-full-advance.js, kaola-{gitlab,gitea}-workflow-*-advance.js, phase4-advance.js), forge nouns, phase1-5, fast/full, fast-summary.md preserved. ADR strip identical across editions → symmetry maintained.

verdict: pass
