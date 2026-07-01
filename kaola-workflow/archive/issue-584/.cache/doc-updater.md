verdict: pass

# Documentation Update Evidence - issue-584

Documentation work was completed in node `n3-install-guidance` and recorded in
`.cache/n3-install-guidance.md`.

Updated user-facing guidance:

- `README.md` now separates read-only Codex config audit from user-authorized
  global config edits, documents the accepted V2 config forms, keeps warning
  suppression independent, and states that runtime child-session effort proof is
  still required.
- `commands/workflow-init.md` and the GitLab/Gitea Codex init commands carry the
  same install-audit direction without issue or decision provenance tokens.
- The three Codex init skill packs carry the same audit, classification, and
  no-silent-mutation guidance.
- `docs/decisions/D-584-01.md` records the design boundary.
- `CHANGELOG.md` records the user-visible fix.

No additional API, environment variable, architecture, or generated-reference
documentation change was needed for this issue.
