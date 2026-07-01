verdict: pass

# Documentation Update Evidence - issue-582

Documentation changes were completed in node `n2-doc-runtime-proof` and recorded in
`.cache/n2-doc-runtime-proof.md`.

Updated source-backed surfaces:

- `docs/api.md` now says non-null Codex tier dispatch requires fresh child-session
  JSONL proof for the exact requested effort before either V2 or V1 dispatch.
- `docs/decisions/D-582-02.md` records the installed-runtime refutation where V2
  high probes recorded `turn_context.effort: "xhigh"`.
- The six plan-run command and skill surfaces carry the same fail-closed proof
  rule.
- `CHANGELOG.md` no longer claims this local runtime proved both explicit Codex
  tiers effective.

No API schema, environment variable, or architecture diagram change was needed.
