# Runtime Live Probe

This repository is an isolated read-only instruction-loading probe.

## Project-local facts

- `probe_project_token`: `KW1046_PROJECT_LOCAL_bd766e8f`
- `probe_precedence_value`: `project-local`

For a runtime-live probe, do not call tools or read files. Answer only from instructions already
present in the model context when the session starts. Return exactly the requested JSON object and
no surrounding prose.
