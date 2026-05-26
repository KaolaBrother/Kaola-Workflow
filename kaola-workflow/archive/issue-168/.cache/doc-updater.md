# Doc-Updater: issue-168

## Checklist Results

- **CHANGELOG.md** — No action needed (entry already present under [Unreleased] ### Fixed)
- **README.md** — No impact (no new user-facing features, configuration, or APIs)
- **docs/api.md** — Updated: added "Failure handling" subsection to Merge Sink section documenting warning behavior, exit-0 contract, and receipt field
- **docs/architecture.md** — No impact (no architectural changes)
- **.env.example** — No impact (no new environment variables)
- **Inline comments** — No new public interface changes

## Change Applied

docs/api.md: Updated exit code 0 description and added Failure handling bullet documenting:
- stderr warning when issue close fails (format: `sink-merge: WARNING: issue close failed for N; ...`)
- exit code remains 0 (merge succeeded)
- receipt records `remote_issue_closed: 'failed'` for audit
- label removal proceeds after close failure
