# Doc docking — bundle-1087 (#1087)

- README.md — no-impact: uninstall references point at docs/installation.md#uninstall (scope-specific instructions), which was rewritten; no stale claims found.
- docs/installation.md — updated by lanes/integration: per-runtime uninstall ownership, Shared blocks and references section (reference lifecycle, upgrade note for pre-#1087 runtimes, install-all --yes seeding), per-target GC uninstall release note.
- docs/api.md, docs/devin-edition.md, docs/droid-edition.md, docs/dsh-edition.md — updated: per-target GC and DORMANT semantics; stale "carrier never removed" wording corrected.
- CHANGELOG.md — [Unreleased] Changed entry for #1087 complete, including the upgrade note clause.
- Public-interface comments — new CLI surfaces (global-contract.js --runtime per-target mode, shared-refs.js registry, codex --uninstall) documented in docs; scripts carry their own help text (validated by suites).
- Install surface — deliberately changed (this issue IS the installer decoupling); mirrors byte-synced (validate-script-sync green in chains); render oracle green.

DOCKED
