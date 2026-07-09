evidence-binding: n2-codex-runtime-evidence 6143b63e7918

findings: See detailed findings below.
- Official Codex manual evidence supports treating quoted project/plugin table headers as real Codex `config.toml` shapes: config lives in `~/.codex/config.toml`; sample config documents `[projects."/absolute/path/to/project"]`; plugin docs document `[plugins."gmail@openai-curated"]`; MCP plugin docs document nested quoted plugin tables such as `[plugins."sample@test".mcp_servers.sample]`.
- Official Codex manual evidence supports documented subagent config shape: current Codex releases enable subagent workflows by default; Codex only spawns subagents when explicitly asked; global subagent settings live under `[agents]`; documented fields are `agents.max_threads`, `agents.max_depth`, and `agents.job_max_runtime_seconds`; `agents.max_threads` defaults to `6`.
- Official Codex manual evidence supports standard feature flag shape: feature flags live under `[features]`; manual-supported feature keys include `multi_agent` as a stable boolean; enabling a feature is adding `feature_name = true` under `[features]`; CLI `--enable feature_name` is equivalent to `-c features.<name>=true`.
- Bounded documentation gap: fetched official manual has no matches for `multi_agent_v2`, `features.multi_agent_v2`, or `max_concurrent_threads_per_session`; treat `features.multi_agent_v2.max_concurrent_threads_per_session` as local/runtime-recognized but undocumented/private, not public manual-documented.
- Local runtime/config-shape evidence for the private key: installed CLI observed `/Users/ylpromax5/.local/node-v24.14.0-darwin-arm64/bin/codex`, `codex-cli 0.143.0`; `codex features list` reports `multi_agent_v2` as under-development and effective `true`; user config has `[features]` with inline `multi_agent_v2 = { enabled = true, max_concurrent_threads_per_session = 5, hide_spawn_agent_metadata = false, non_code_mode_only = false }` and `[agents] max_threads = 5`.
- Installed native Codex binary strings include `MultiAgentV2ConfigToml`, `features.multi_agent_v2.max_concurrent_threads_per_session`, wait-timeout sibling keys, `hide_spawn_agent_metadata`, `non_code_mode_only`, and validation/conflict string `agents.max_threads cannot be set when features.multi_agent_v2 is enabled`. This justifies treating the private v2 bound as a real local Codex 0.143.0 runtime config shape while preserving the public-docs gap.

sources: See source list below.
- OpenAI Codex manual, local fetched file `/var/folders/j6/8368yp9j35597_g9_f148lz00000gn/T/openai-docs-cache/codex-manual.md`, inspected 2026-07-09:
  - Config basics/source and config locations: lines 2715-2724.
  - Config precedence: lines 2733-2744.
  - Advanced config/project config behavior: lines 2178-2195.
  - Feature flags and supported `multi_agent`: lines 2876-2917.
  - Sample `[agents]` table: lines 3300-3324.
  - Sample `[features]` table: lines 3624-3656.
  - Sample `[projects]` and `[projects."/absolute/path/to/project"]`: lines 4018-4028.
  - MCP plugin-provided server config with `[plugins."sample@test".mcp_servers.sample]`: lines 8070-8084.
  - Plugin disable config with `[plugins."gmail@openai-curated"]`: lines 11848-11862.
  - Subagents availability/orchestration: lines 12290-12310.
  - Subagent `[agents]` fields/defaults: lines 12376-12390.
- Manual silence check: `rg -n "multi_agent_v2|max_concurrent_threads_per_session|features\.multi_agent_v2" /var/folders/j6/8368yp9j35597_g9_f148lz00000gn/T/openai-docs-cache/codex-manual.md` exited 1 with no output.
- Local CLI/runtime checks: `command -v codex && codex --version`; `codex features list`; `/Users/ylpromax5/.codex/config.toml` feature/plugin/agent blocks; native Codex binary token extraction from `/Users/ylpromax5/.local/node-v24.14.0-darwin-arm64/lib/node_modules/@openai/codex/node_modules/@openai/codex-darwin-arm64/vendor/aarch64-apple-darwin/bin/codex`.
