# finalize node (sink) — issue #284

Finalize-node bookkeeping (declared write-set: CHANGELOG.md). Added the #284 entry under [Unreleased] in the established bold-led style: documents the four Codex lifecycle hooks, the installer-managed .codex/hooks.json (merge-by-id idempotency, __KW_PLUGIN_ROOT__ resolution, /hooks trust line), the SubagentStart producer making checkDispatchAttestations live (AC3), the 2 byte-identical github-codex .sh additions + validate-script-sync registration + uninstall cleanup, WARN-first posture + multi_agent-off precondition, RED→GREEN test coverage, all-4-chains-green, and the dogfooded adaptive DAG shape.

Pre-sink validation already established: all four edition chains green (claude && codex && gitlab && gitea, exit 0, run sequentially per #307); G1 code-review verdict: pass / findings_blocking: 0 (3 LOW out_of_scope follow-ups recorded).

Next: route to /kaola-workflow-finalize for the whole-plan barrier/gate-verify/verdict-check + sink-merge + archive + close issue #284.
