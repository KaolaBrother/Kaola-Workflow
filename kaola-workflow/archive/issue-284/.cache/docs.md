# docs node (doc-updater) — issue #284

Documented the four Codex lifecycle hooks across the 3 declared files (grounded against the actual implementation; all stale "#266 deferred / no equivalent hook" text removed; in-lane only).

- README.md (+30/-1): new `### Codex lifecycle hooks` subsection (4-row table mirroring the hook ids, Codex SessionStart script name, project-local .codex/hooks.json wiring not plugin manifest) + 4 caveats (/hooks trust, multi_agent precondition WARN-first, matcher caveat, uninstall scope). Removed stale "Claude-Code editions only" qualifier on the dispatch-log row.
- docs/architecture.md (+2/-2): M1 bullet now "active on all four editions … on Codex installed into project-local .codex/hooks.json by install-codex-agent-profiles.js; requires multi_agent (off → never fires, attestation missing, WARN-first)"; compact bullet now states SessionStart(compact) hook id kaola-workflow:compact-context wiring + still on-demand-invokable + plugin.json has no hooks key.
- docs/api.md (+71/-1): updated the compact-resume note; new "## Codex .codex/hooks.json managed-entry contract" section (id-prefix kaola-workflow: marker, idempotent merge-by-id, __KW_PLUGIN_ROOT__ absolute-path substitution, 4-event/matcher/id table, installer /hooks console line, 4 caveats).

Verified: spot-checked api.md claims (kaola-workflow:compact-context, subagent-dispatch-log, __KW_PLUGIN_ROOT__, merge-by-id, multi_agent) match the real installer/config code. Surgical, additive, matches each file's voice. CHANGELOG.md intentionally NOT touched (finalize node owns it).
