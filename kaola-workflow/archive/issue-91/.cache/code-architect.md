# Code Architect Notes - issue-91

Status: local-fallback-tool-unavailable

The named workflow role `code-architect` is not available as a callable Codex
subagent role in this session, so blueprinting was performed locally under
`delegation_policy: tool-unavailable`.

## Blueprint

1. Extend Codex repair-state with a reusable `delegationPolicyCompliance()`
   helper and thread it through `unresolvedCompliance()` for phase-boundary
   routing. Preserve the scalar `delegation_policy:` field when repairing
   state. Mirror the byte-identical script under `plugins/kaola-workflow`.
2. Extend GitLab repair-state with the same policy helper and preserve
   `delegation_policy:` when reconstructing state.
3. Add validator fixtures:
   - Codex validator imports the root repair-state helper and checks
     `delegate`, `local-authorized`, `tool-unavailable`, all-unavailable, and
     intentional non-role `invoked` cases.
   - GitLab validator imports its repair-state helper and checks the same
     semantics.
4. Update `kaola-workflow-next/SKILL.md` in both Codex and GitLab plugins so
   Routing explicitly extracts and reassigns `phase`, `next_skill`, and
   `delegation_policy:` on resume.
5. Add comments near advisor/finalize non-doc compliance tables in both plugins
   explaining that plain `invoked` is intentional for non-Codex-role workflow
   gates. Add validator assertions for those comments.

## Dependency Notes

- Codex root/plugin repair-state must be changed together because
  `validate-script-sync.js` compares them byte-for-byte.
- Validators should use direct helper calls instead of depending on active
  workflow folders.
- No changes to `validate-workflow-contracts.js`.
