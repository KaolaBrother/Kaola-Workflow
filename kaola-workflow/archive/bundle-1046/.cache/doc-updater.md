# Documentation update — bundle-1046

verdict: DOCKED

Verified ground truth transcribed from frozen candidate
`bd766e8f47ca04ae716870d441bc9f4d8ea17d50`, the exact-SHA chain receipt, the nine-host
capability matrix, and the final Issue #1046 Design of Record:

- `README.md` documents the machine-global contract, subtractive project instructions, batch
  installation, supported hosts, and Cursor Cloud selected-repository materialization.
- `CHANGELOG.md` records the user-visible global-contract transaction, compact/reload carrier
  correction, removal of tool-use injection, and workflow-init migration behavior under
  `[Unreleased]`.
- `docs/api.md` matches the registry-derived plan/install/check/uninstall interface, receipt fields,
  cloud commands, and project-instruction compatibility boundary.
- `docs/architecture.md` records one runtime-neutral author source, adapter-only capability
  differences, installation-time rendering, and the machine/project instruction split.
- `docs/conventions.md` records zero Kaola prompt bytes or subprocesses on ordinary tool use and the
  measured compact/reload carrier rule.
- `docs/runtime-capabilities.md`, `docs/cursor-edition.md`, and `docs/grok-edition.md` match the
  measured discovery, precedence, reload, dispatch, and host-separation facts.
- `docs/decisions/0022-machine-global-workflow-contract.md` is linked from `docs/README.md` and
  captures the architecture decision, ownership boundary, and subtractive rationale.
- Generated Workflow Next, Finalization, Init, and compact-recovery surfaces are checked against
  their skeletons and keep the dispatch contract always loaded.

Verification sources:

- `templates/global/kaola-workflow-global.md`
- `templates/global/runtime-contract-adapters.json`
- `scripts/kaola-workflow-global-contract.js`
- `scripts/kaola-workflow-project-instructions.js`
- `kaola-workflow/bundle-1046/.cache/runtime-live-matrix/README.md`
- `kaola-workflow/bundle-1046/.cache/chain-receipt.json`
- GitHub Issue #1046 updated Design of Record

No `.env.example` change: no environment variable, credential, external dependency, or secret was
introduced. The new ADR is indexed. Claude's unavailable live model leg and Cursor Cloud's
post-release saved-Active-Build gate are stated as explicit evidence boundaries, not inferred PASS.
