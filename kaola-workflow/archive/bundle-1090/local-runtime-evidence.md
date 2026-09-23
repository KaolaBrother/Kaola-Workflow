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

## HALT — catalog contradiction (2026-09-23)

Host/Owner (Yanlei) halt, delivered by the Delegator. The Codex CLI on this Mac was upgraded to
**0.156.0**. The Host re-ran the read-only `model/list` itself on 0.156.0 and got exactly these
entries:

- `gpt-6-astra` (isDefault)
- `gpt-5.6-sol`
- `gpt-5.6-terra`
- `gpt-5.6-luna`
- `gpt-5.5`

**`gpt-6-luna` and `gpt-6-sol` are missing.** That contradicts the 0.155.1 probe above, which
listed `gpt-6-luna` (efforts low/medium/high/xhigh/max). The worker did not re-run the probe after
the halt; the list above is the Host's result, as relayed.

State at halt: the candidate is committed at `83358a74` on `workflow/bundle-1090`. Focused suites
passed on that candidate. `npm test` was stopped partway, so it has no exit code. The integration
walkthrough and `install-all.sh --check` never started. Nothing was installed, finalized, merged, or
closed. The run is paused until the Owner decides.

## RESUME — catalog re-bound (2026-09-23, Owner instruction)

Owner resumed the issue after the catalog reconciled (issue #1090 comment of 01:24Z). The resume
seat re-ran the probe itself. It did not rely on the Host's relay. Method is unchanged:
`codex app-server`, JSON-RPC `initialize` + `initialized` + `model/list`, paging until no
`nextCursor`. No turns, no configuration writes. Raw outputs are in `/tmp/kw1090-resume/probe-*.json`.

Probe at 2026-09-23T01:25:21Z, codex-cli **0.156.0** (`/opt/homebrew/bin/codex`), default
visibility: **7 models on one page, `nextCursor: null`**.

| id | hidden | isDefault | supported reasoning efforts |
|---|---|---|---|
| `gpt-6-astra` | false | **true** | low, medium, high, xhigh, max, ultra |
| `gpt-6-sol` | false | false | low, medium, high, xhigh, max, ultra |
| **`gpt-6-luna`** | **false** | false | **low, medium, high, xhigh, max** |
| `gpt-5.6-sol` | false | false | low, medium, high, xhigh, max, ultra |
| `gpt-5.6-terra` | false | false | low, medium, high, xhigh, max, ultra |
| `gpt-5.6-luna` | false | false | low, medium, high, xhigh, max |
| `gpt-5.5` | false | false | low, medium, high, xhigh |

`includeHidden: true` adds only the hidden rows `gpt-reserve` and `codex-auto-review`. Two
repeat probes at 01:29:02Z and 01:30:02Z returned the same 7 ids. The halt note's premise no
longer holds. `gpt-6-luna` is catalog-backed on 0.156.0 and supports `max`, so the pin
`gpt-6-luna` / `max` on `83358a74` stands unchanged.

## Load/bind path of the Workflow Codex standard tier (measured 2026-09-23)

How the pin travels: `~/.codex/config.toml` `[agents.<role>]` has
`config_file = "<CODEX_HOME>/agents/kaola-workflow/<role>.toml"`. `config/read` on 0.156.0
resolves all seven roles to those absolute paths. That role file carries top-level
`model = "gpt-6-luna"` and `model_reasoning_effort = "max"`, and per ADR 0025 its values win over
the parent session. Kaola's `kaola-workflow-codex-preflight.js` checks the pin as a static string
equal to `CODEX_STANDARD_MODEL`. It never consults a catalog.

### (a) The codex app-server, which is the path a profile layer takes

This is an emulation. Ephemeral `thread/start` calls applied a config layer shaped like the role
file. No turn was sent. `thread/start` returns the model and effort it resolved:

| case | 0.156.0 result | 0.153.4 result |
|---|---|---|
| layer `gpt-6-luna` / `max` (role-file shape) | `gpt-6-luna` / `max` | `gpt-6-luna` / `max` |
| param `model=gpt-6-luna` + layer effort `max` | `gpt-6-luna` / `max` | `gpt-6-luna` / `max` |
| unknown id `gpt-6-luna-kwprobe-nonexistent` / `max` | **accepted** as given | **accepted** as given |
| `gpt-6-luna` / `ultra` (not in the catalog row) | **accepted** `ultra` | **accepted** `ultra` |
| control `gpt-5.6-luna` / `max` | `gpt-5.6-luna` / `max` | `gpt-5.6-luna` / `max` |

What this shows: the config/thread bind path is a **pass-through string**. The CLI resolves the
pinned id and effort exactly as written, and never checks them against `model/list`, on either CLI
version. **So "catalog-backed" is a separate fact that only `model/list` establishes.** A profile
pin to an id the catalog lacks would still bind here, and it would fail no earlier than the first
backend request. The tests cannot see this. It is why the catalog probe above is the evidence
for this change.

The catalog also depends on the client version. At the same minute and on the same account,
codex-cli **0.153.4** (the ACP pin, `npx @openai/codex@0.153.4`) returned **5 models**:
`gpt-6-astra`, `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna`, `gpt-5.5`. There was no
`gpt-6-luna` and no `gpt-6-sol`. 0.156.0 returned 7. `~/.codex/models_cache.json` is a single
file shared by every CLI version and stamped with `client_version`. A 0.153.4 fetch rewrites it to
the 5-model list.

I tested one hypothesis for the 08:55 absence: 0.156.0 served from a cache that 0.153.4 wrote. It
is **falsified** for the present moment. With the cache holding the 0.153.4 list, a 0.156.0
`model/list` refetched on the `client_version` mismatch, returned 7 models, and rewrote the cache
as 0.156.0. The 08:55 absence stays unexplained locally. The Owner's reading, transient backend
state, is not contradicted. The 5-model set at 08:55 is exactly the 0.153.4-gated set.

### (b) Runner/ACP (`@openai/codex@0.153.4` + `@agentclientprotocol/codex-acp@1.11.0`)

The probe sent `initialize`, then `session/new` with no prompt. It then tried to select a model
through `session/set_config_option` (`configId: "model"`) and the legacy `session/set_model`.

- The adapter identified itself as `@agentclientprotocol/codex-acp` **1.11.0**. It wrote the
  shared models cache with `client_version: 0.153.4`, so it runs on the 0.153.4 catalog.
- `session/new` advertised model values `gpt-6-sol` (current), `gpt-6-astra`, `gpt-5.6-sol`,
  `gpt-5.6-terra`, `gpt-5.6-luna`, `gpt-5.5`. The legacy variants list is
  `gpt-6-astra[low…ultra]`, `gpt-5.6-sol[…]`, `gpt-5.6-terra[…]`, `gpt-5.6-luna[low…max]`,
  `gpt-5.5[…]`. **`gpt-6-luna` is not advertised.** `gpt-6-sol` appears only as the current
  value copied from `~/.codex/config.toml` `model = "gpt-6-sol"`, with no variants.
- `set_config_option model=gpt-5.6-luna` was **accepted**, and the effort option then offered
  low…max. `model=gpt-6-luna` was **rejected** with `-32602 Invalid params`. After switching away,
  `model=gpt-6-sol` was **also rejected** with `-32602`. `set_model gpt-5.6-luna[max]` returned ok.
  `set_model gpt-6-luna[max]` was **rejected** with `-32603 "Unknown model gpt-6-luna[max]"`.

What this shows: the ACP option surface is **catalog-validated against the 0.153.4 catalog**. That
is the opposite of the pass-through bind path. An ACP seat cannot *select* `gpt-6-luna` as its own
session model. This is the same class as KPR #142 for `gpt-6-sol`: the value is advertised only
because config.toml currently holds it, and it cannot be re-selected.

### Distinction and what stays unmeasured

- **Catalog-backed binding:** a Workflow Codex subagent spawned under an interactive codex-cli
  0.156.0 parent binds `gpt-6-luna` / `max`, and 0.156.0's catalog lists that pair. Measured.
- **ACP option advertisement:** the Runner seat's model picker on 0.153.4 + adapter 1.11.0 does not
  offer or accept `gpt-6-luna`. That concerns the seat's own session model, not the role file.
- **Not measured (needs a generation request, which this seat's brief does not authorize):**
  whether a subagent spawned *inside* a 0.153.4-based ACP seat with the role-file pin
  `gpt-6-luna` is served by the backend. The bind path accepts the string (see (a)). Nothing
  local decides whether a 0.153.4 client is served a model its catalog withholds. The decisive
  experiment is one minimal `spawn_agent` of a Kaola role from an ACP seat, then reading the
  child's actual model. Until someone runs it, the working assumption is that Workflow Codex
  dispatch that wants Luna 6 should run under codex-cli ≥ 0.156.0. Moving the ACP pin past 0.153.4
  belongs to the Runner, not this issue.

Side effects: the only one was `~/.codex/models_cache.json`, which the probes rewrote. It was left
as a 0.156.0 fetch (7 visible + 2 hidden) at 01:30:02Z. No session files were created. No config
was written.

Installed state: `~/.codex/agents/kaola-workflow/*.toml` still hold the v12.2.4 pin
`model = "gpt-5.6-luna"`, and so does the marketplace cache
`~/.codex/plugins/cache/kaolabrother-kaola-workflow/kaola-workflow/12.2.4/`. Live dispatch
binds Luna 6 only after this branch is merged, released, and installed with
`./install-all.sh --yes`. Before Host acceptance, no refresh was performed.

## RESUME — validation receipts on `83358a74` (2026-09-23)

The candidate is unchanged: `workflow/bundle-1090` @ `83358a743bb0e036bbd772dad787e7543c1164fd`.
Logs are in `/tmp/kw1090-resume/<step>.log`, and the rc lines in `/tmp/kw1090-resume/summary.txt`.

| step | command | rc | secs |
|---|---|---|---|
| f01–f12 | profile/routing/edition-sync/script-sync checks, 3 pin tests, 3 forge contract validators, Codex walkthrough | 0 (all 12) | — |
| n1 | `npm test` (claude + codex + gitlab + gitea chains; complete rerun, final line `generate-routing-surfaces --check: all 24 surfaces byte-match the skeleton.`) | 0 | 980 |
| w1 | `node scripts/simulate-workflow-walkthrough.js` (178/178 scenarios) | 0 | 93 |
| i1 | `./install-all.sh --check` (dry-run, 10 runtimes PLAN, carriers CURRENT, codex plugin 12.2.4) | 0 | 5 |

The earlier `npm test` attempt was killed when its holder's turn ended, so it has no rc. Its log is
kept as `n1-npm-test.interrupted-1.log`. The rerun above ran in a detached session.

`install-all --check` does not compare the contents of the installed Codex role files, which
still pin `gpt-5.6-luna`. The codex marketplace plugin is gated on the version number: it reports
"already at 12.2.4". So the live binding converges only after a version-bumped release is installed.
