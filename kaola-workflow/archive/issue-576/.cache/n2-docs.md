evidence-binding: n2-docs b9b3bad4cd19

## docs/conventions.md

Three targeted edits to the "Provenance stays out of agent-facing prompts" section:

1. Banned token table — added `| Forge request refs | PR#NNN, MR#NNN, AC#NNN |` row (fifth banned class, new to #576 beyond the original #575 four).
2. Allowlist — added two new bullets: numeric placeholders (`#N`, `#<issue>`, `#<n>`) and audit/gate short-labels (`G1`, `G3`, `H5`, `AC7`, `M4`); corrected the illustrative-examples bullet to require placeholder form (actual-number examples like `"work on #42"` now flagged by the machine guard).
3. Enforcement subsection — replaced the "deferred follow-up" prose with the machine-enforcement description: exact banlist regex, per-edition surface placement table (five validators + opencode A25), statement that violations are hard chain failures with `file:line` diagnostics, cross-references to D-575-01 and D-576-01.

## docs/decisions/D-576-01.md

New decision record authored from scratch, mirroring the D-575-01 / D-572-01 format:

- Records that the PROVENANCE_BAN guard is implemented (supersedes the "Deferred" section of D-575-01).
- Documents the banlist regex, all five banned classes (including the new forge-request-refs arm), the structural allowlist and its mechanical basis, per-edition surface placement, and the opencode additive-suite carve-out (D-530-02).
- Alternatives considered: edition-scoped-only enforcement, allowlist config file, fail-warn mode, context-exempt illustrative examples — all rejected with stated rationale.
