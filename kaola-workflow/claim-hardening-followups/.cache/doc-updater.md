# Doc Updater: claim-hardening-followups

## Checklist Assessment

- README.md: NO UPDATE NEEDED — no user-facing features or CLI interface changes
- API docs: NO UPDATE NEEDED — no public API; script is internal automation
- CHANGELOG.md: UPDATED — added bullet under `### Security` in `## Unreleased` for updateSinkLease function-form replace hardening
- Architecture docs: NO UPDATE NEEDED — no structural changes
- .env.example: NO UPDATE NEEDED — no new environment variables
- Inline comments: NO UPDATE NEEDED — no public interface changes

## Change Made

Added to CHANGELOG.md `### Security` section:
> `updateSinkLease` now uses function-form `.replace()` callbacks instead of string-form, preventing `$&`/`$1` metacharacter expansion if workflow field values contain `$` characters.

## Date
2026-05-15T05:00:00Z
