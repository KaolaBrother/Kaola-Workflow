# Doc docking — bundle-1085 (#1085)

Checked against the AGENTS.md documentation checklist for the changed public surface
(runtime-capability copy refresh; no API, installer, environment, or validation behavior change).

- README.md — no-impact: greps for `secondary model`, `agents.<role>`, `config_file` return nothing;
  no runtime-capability claims live there.
- docs/api.md — updated: Codex role-resolution sentences (1848-1851) now describe directory
  discovery + config registration; `agents.toml` installer-source sentence retained.
- docs/README.md (index) — no-impact: no files added/removed/renamed; all existing links still
  resolve against the current tree.
- docs/architecture.md — updated: "installed registration authority" replaced by the two live
  paths (recursive `agents/` discovery with `name` identity + managed `[agents.<role>]` blocks the
  installer prunes against).
- docs/conventions.md — updated: "Resolve role registration from …" rewritten to the same
  two-path form.
- docs/runtime-capabilities.md — updated: Codex table row (two-path lookup), Kimi opt-in sentence
  (158-159), Kimi evidence bullet (267-268 area, now with the 2026-09-21 live inheritance probe).
- docs/kimi-edition.md — updated: `[secondary_model]` described as optional/user-owned GA section
  with measured keys and env carriers; "experimental" removed (two spots).
- docs/decisions/0021 — updated via dated "Measured refresh (2026-09-21, #1085)" note, matching
  the file's own 2026-09-05 precedent; decision text otherwise untouched.
- CHANGELOG.md — updated: `[Unreleased]` → Changed entry recording both measured corrections and
  the Grok not-confirmed outcome.
- Public-interface comments — no-impact: no script signatures, CLI flags, or JSON schema shapes
  changed; runtime-capabilities.json gained two evidence entries within the existing schema
  (validated by generate-agent-profiles --check).
- Install surface — no-impact: no installer/sync script changed; `.kimi*` mirrors regenerated only
  through `scripts/sync-kimi-edition.js --write` (the sanctioned path); render oracle baseline
  recaptured in-commit per the #1055 baseline policy.

DOCKED
