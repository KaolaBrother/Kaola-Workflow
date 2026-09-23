# Local runtime evidence — #1090

## Codex model catalog (read-only probe, 2026-09-23)

Method (the #1049 `local-runtime-evidence.md` method): spawn `codex app-server --stdio` from
codex-cli **0.155.1**, send JSON-RPC `initialize` then `model/list` (paged until no `nextCursor`),
terminate only the spawned child. No model-generation request, no configuration write, no feature
opt-in. `~/.codex/config.toml` was not touched.

Returned catalog (one page):

| id | displayName | supported reasoning efforts | default effort | isDefault |
|---|---|---|---|---|
| `gpt-6-astra` | GPT-6-Astra | low, medium, high, xhigh, max, ultra | medium | true |
| `gpt-6-sol` | GPT-6-Sol | low, medium, high, xhigh, max, ultra | medium | false |
| **`gpt-6-luna`** | **GPT-6-Luna** — "Fast and affordable model for easier tasks." | **low, medium, high, xhigh, max** | medium | false |
| `gpt-5.6-sol` | GPT-5.6-Sol | low, medium, high, xhigh, max, ultra | low | false |
| `gpt-5.6-terra` | GPT-5.6-Terra | low, medium, high, xhigh, max, ultra | medium | false |
| `gpt-5.6-luna` | GPT-5.6-Luna — "Older fast and efficient model." | low, medium, high, xhigh, max | medium | false |
| `gpt-5.5` | GPT-5.5 | low, medium, high, xhigh | medium | false |

Verdict: the issue's premise holds. `gpt-6-luna` exists and supports `max`, so the standard-tier
pin moves to `gpt-6-luna` with `model_reasoning_effort = "max"` unchanged.
