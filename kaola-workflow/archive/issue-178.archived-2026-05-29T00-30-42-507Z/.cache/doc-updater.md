# Doc-Updater Output: issue-178

## Files Updated

### CHANGELOG.md
Added entry under [Unreleased] → Added: timeout-bounded remote issue state checks feature,
documenting KAOLA_GH_REMOTE_TIMEOUT_MS env var (default 30000ms), timeout behavior in
probeIssueState, audit sentinel strings, and label repair timeout handling across all three
forge editions.

### .env.example
Added KAOLA_GH_REMOTE_TIMEOUT_MS=30000 with comment explaining timeout control for
GitHub/GitLab/Gitea API responses and test usage.

### README.md
Added KAOLA_GH_REMOTE_TIMEOUT_MS row to the Environment Variables table with default 30000ms
and test usage note.

### docs/api.md
- New section "Timeout-Bounded Remote Calls (issue #178)" documenting scope, default timeout,
  probeIssueState timeout return, skipped_timeout sentinel, unresolved_closed_state JSON field,
  and labels_skipped_reason:'timeout' repair field
- Environment Variables section split into Timeout Control / Test Hooks subsections
- Updated closure-audit JSON examples to show unresolved_closed_state and labels_skipped_reason
- Updated drift classes table: added unresolved_closed_state row (omit-when-empty)
- Enhanced offline behavior section with timeout behavior paragraph

### Skipped (with reasons)
- docs/architecture.md: no structural change — timeout bounds are operational/reliability
  enhancement transparent to the architecture layer
- Inline comments: no new public interfaces; existing return types have new sentinel values
  that are self-documenting
