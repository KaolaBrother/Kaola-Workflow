## Cold-session close evidence — PASS (2026-08-22)

Measured with Cursor CLI `2026.08.11-e8db854` after deploying the generated #1013 tree through the real installer into an isolated project (`--no-scripts`, so live user agents/config/hooks were untouched).

Fresh parent session `9c0b65bf-b333-43af-861e-1ddaa15cdb9f` initialized as **Cursor Grok 4.6 Extra High**. The prompt dispatched fresh custom `implementer` and `code-reviewer` Tasks and omitted a per-call model override. Cursor's streamed Task envelopes resolved:

- `implementer` -> `cursor-grok-4.6-medium`
- `code-reviewer` -> `cursor-grok-4.6-high`

Both Tasks completed successfully. Each child self-identified only as `Cursor Grok 4.6`, and neither saw a Grok slug in its own nested Task allowlist; those two surfaces are therefore not effort oracles on this path. The parent stream's resolved Task envelope is direct carrier evidence that the generated unquoted frontmatter pins were loaded and remained distinct from the xhigh parent.

Verdict: **PASS**. The family clamp did not swallow the pins. No typed deferral, `Task(model=)` workaround, config seeding, or second pin path is needed. Exact local evidence is retained in `kaola-workflow/issue-1013/.cache/live-cursor.md` for the run archive.
