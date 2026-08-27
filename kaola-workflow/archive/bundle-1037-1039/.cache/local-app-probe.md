# Cursor local App live probe

- Date: 2026-08-27 (Asia/Shanghai)
- App: `/Applications/Cursor.app` (`com.todesktop.230313mzl4w4u92`)
- Host selected in the Cursor Agents UI: `This Mac`
- Repository selected in the UI: `kaola-workflow`
- Mutation boundary requested: no files, shell, commits, settings, or network activity

## Probe

The local IDE Agent was instructed to inspect its live Task/subagent catalog and dispatch exactly one child using the project custom agent name `implementer`, without any per-call model field and without substituting a built-in route. The child was instructed to return only `PROBE_OK LOCAL_IDE_NAMED_IMPLEMENTER`.

## Observed result

- The live catalog included the project custom `implementer` type (as well as the other generated Kaola roles).
- The named `implementer` dispatch completed and returned `PROBE_OK LOCAL_IDE_NAMED_IMPLEMENTER`.
- Cursor reported no model/profile/effort/thought value in the result. Its tool description said an omitted model defaults to the parent, but the live result did not expose enough data to verify that binding. Therefore the named-route behavior is proved while profile-carrier observability remains unknown.
- The Cursor UI showed `Changes +60`; a subsequent repository check established these were the already-existing untracked workflow authority files under `kaola-workflow/bundle-1037-1039/`, not tracked edits from the probe.
- After the probe, `git diff --stat` and `git diff --cached --stat` were empty in the main checkout, and the candidate worktree was clean.

## Verdict

PASS for the local Cursor App/IDE named-agent execution surface. No claim is made that this proves the distinct standalone CLI or fresh pre-boot Cloud consumer surfaces, and no claim is made that the omitted model/profile carrier was observable.
