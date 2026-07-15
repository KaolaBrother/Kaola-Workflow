evidence-binding: n8-document-inheritance-contract 7fd1bd4cbfde
docs_updated: README.md, docs/api.md, docs/architecture.md, docs/decisions/D-687-01.md
local_execution: local-fallback-explicit
upstream_read: n7-inheritance-falsifier bc14f1f75cd9

# Codex inheritance documentation

Updated the four frozen documentation surfaces from the reviewed and falsified contract:

- role-profile omission inherits the effective parent-session model and effort;
- `reasoning`/`standard` remain declarative metadata and preserve 40/20-minute wait budgets;
- exact historical Sol/medium and Sol/xhigh managed pairs migrate to omission, while partial or
  foreign explicit pins are malformed;
- the per-profile omission rule is distinct from the unchanged user-owned root
  `model_reasoning_effort` dispatch-posture setting;
- dispatch cards use `codex_profile_mode:'inherit'` and `parent_session` sources;
- parent/child session JSONL equality, profile binding, and bounded fail-closed scanning provide
  runtime proof; and
- reasoning-floor roles require fresh classified parent proof rather than trusting tier metadata.

The new D-687-01 decision records the live Codex 0.144.3 proof boundary, why one representative
child proves the shared omission mechanism, the R13 regular-file race closure, and the non-Codex
behavior preserved by the change.

Validation:

- `rg` found no surviving current-contract static-profile claims on the four changed surfaces.
- `git diff --check` passed.
