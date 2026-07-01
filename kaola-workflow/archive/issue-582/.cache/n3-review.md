evidence-binding: n3-review 254ee1808133
verdict: pass
findings_blocking: 0

Review notes:
- Six plan-run command/skill surfaces now all require a fresh child-session effort proof before non-null Codex tier dispatch, and the rule explicitly applies to both V2 and V1.
- The proof source is correctly narrowed to child session JSONL `turn_context.effort`; config text, `codex features list`, spawn arguments, and parent descriptors are rejected as proof.
- Focused validators pin the new phrase across root, Codex, GitLab, and Gitea surfaces.
- `docs/api.md` and `docs/decisions/D-582-02.md` document the local V2 high-probe refutation and the new fail-closed contract.
- No blocking findings. The existing CHANGELOG entry still claims #582 made both explicit tiers effective; n4-finalize owns correcting that final user-visible note.
