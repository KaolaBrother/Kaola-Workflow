evidence-binding: n5-docs 1c860a734f01
# n5-docs — evidence

Added durable documentation (these files legitimately cite issue/decision numbers).
- CLAUDE.md: new bullet under ## Non-Negotiable Rules — 'Keep provenance out of agent-facing prompts' (issue/D/[INV]/ADR banned in agents/commands/skills; provenance → CHANGELOG/docs/decisions/commits; target-issue variables exempt). File = 136 lines (< 200 cap).
- docs/conventions.md: new section '## Provenance stays out of agent-facing prompts (#575)' — surface set, banned classes, allowlist, where provenance belongs, machine-enforcement deferred.
- docs/decisions/D-575-01.md: new decision record — context (~636 tokens/129 files), decision, mid-run ADR scope correction (n4b), verification gates (n6/n7), deferred lint guard.

verdict: pass
