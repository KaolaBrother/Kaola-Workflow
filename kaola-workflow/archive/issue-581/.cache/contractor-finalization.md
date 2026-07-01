# Contractor Finalization Fallback - issue-581

Status: local-fallback-tool-unavailable

The mechanical finalization procedure is being run inline by the main session because:

- the current session policy does not allow subagent delegation;
- `.codex/agents/kaola-workflow/` is absent in this checkout;
- `cmdFinalize` must therefore be invoked without `--attest-contractor-spawn`.

The expected `finalize_contractor_attested: missing` warning is truthful and non-blocking for this
inline fallback path.

verdict: pass
