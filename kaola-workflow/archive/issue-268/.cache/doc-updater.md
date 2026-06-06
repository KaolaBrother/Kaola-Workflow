# doc-updater evidence — issue #268 (G-SEL-1b phantom-arm fix)

**Date:** 2026-06-07
**Node role:** doc-updater

## Ground truth verified

Exact typed-refusal string confirmed against all four validator source files before use in CHANGELOG:

```
G-SEL-1b: arm "${n.id}" in select group "${n.shape.group}" has no selector_source declared
```

Sources (all at line 553):
- `scripts/kaola-workflow-plan-validator.js`
- `plugins/kaola-workflow/scripts/kaola-workflow-plan-validator.js`
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-plan-validator.js`
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-plan-validator.js`

String matches the api.md documentation added by the docs node. Regression test confirmed in `scripts/simulate-workflow-walkthrough.js` at line 6921.

## CLAUDE.md Documentation Update Checklist

### CHANGELOG.md — UPDATED

Added a bullet under `### Fixed` in `[Unreleased]`, immediately after the #271 entry, covering:
- The silent phantom-arm behaviour (blank `selector_source` arm silently excluded from selectGroups checks)
- The new G-SEL-1b pre-check and exact typed-refusal message (transcribed verbatim from source)
- Additive-only framing (no existing gate relaxed)
- All-4-editions coverage (canonical + Codex mirror + GitLab + Gitea ports)
- api.md contract update and regression test reference
- Issue reference (#268)

### API docs (`docs/api.md`) — NO ACTION NEEDED

G-SEL-1b was already documented by the docs node in the G-SEL rules block of the Grammar paragraph (line 256). Confirmed by grep; the clause reads: "every arm in a `select(<group>)` group MUST carry a non-empty `selector_source` value — a blank arm is a typed refusal: `G-SEL-1b: arm "<id>" in select group "<group>" has no selector_source declared` (issue #268; additive — no existing gate is relaxed)".

### README.md — SKIPPED (no change needed)

`grep -n 'G-SEL' README.md` returned no matches. README documents `select()` only at the supported-patterns table row level (pattern name + governance note, added by #263). G-SEL-1b is an internal validator-enforcement detail with no surface change to the documented pattern shape or user-facing feature. No update warranted.

### Architecture docs (`docs/architecture.md`) — SKIPPED (no change needed)

`grep -n 'G-SEL' docs/architecture.md` returned no matches. The architecture doc lists `select` as one of the four node shapes at a structural level ("selective-execution `select`"). The G-SEL rule numbering and per-rule enforcement details live in `docs/api.md`, not the architecture doc. The documented grammar shape is unchanged; only a pre-check inside an existing rule tightened. No update warranted.

### `.env.example` — SKIPPED (no change needed)

No new environment variable introduced. The fix is entirely internal to the validator's grammar checks.

### Inline comments — SKIPPED (no change needed)

The typed-refusal message is self-documenting. No public interface signature changed. The only interface surface is the error string, which is now documented in api.md and CHANGELOG.md.
