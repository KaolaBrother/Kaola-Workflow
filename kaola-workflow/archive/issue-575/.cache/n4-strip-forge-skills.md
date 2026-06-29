evidence-binding: n4-strip-forge-skills 1fb6e48efadb
# n4-strip-forge-skills — evidence

Stripped provenance from the 18 SKILL.md files (codex+gitlab+gitea × {adapt,fast,finalize,next,plan-run,research}). No rule meaning changed; editions symmetric modulo forge nouns.

## Changed files (18; verified `git status` = exactly the declared set)
Per edition: adapt(12), fast(3), finalize(25), next(10), plan-run(19), research(2).

## Clause-rewrites (meaning preserved)
- `(#451, supersedes #405):` → `:`; `(#463 write-overlap):` → `(write-overlap):`; `#386-exempt` → `exempt`.
- `(the #543 G7 stall...)` two-line clause removed; VERBATIM-surface rule kept.
- bash comment lead-ins `# #399:`, `# #369`, `# #336:` (×3) stripped.
- `inheriting #472 concurrency` → `dispatched concurrently`.

## Inter-edition symmetry
Confirmed: remaining codex↔gitlab↔gitea diffs are forge-noun-only (script prefixes kaola-workflow-* / kaola-gitlab-workflow-* / kaola-gitea-workflow-*, gh/glab/tea, PR/MR). Zero provenance differences.

## Residual grep (within the 18 in-scope files)
Zero (except allowed `Closes #`, `issue #142` example, user-command examples).

## SCOPE NOTE (handed to orchestrator)
A residual scan of ALL skills surfaced `(ADR 0004)` provenance in files OUTSIDE this node's set (plan/execute/ideation/review skills; phase/fast commands) — handled by a follow-on plan-repair node (n4b).

verdict: pass
