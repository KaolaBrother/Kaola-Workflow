# #1063 run_subagent rejection investigation — run summary

## Web findings

From Devin official docs (`docs.devin.ai/cli/subagents`):

- Subagents run as their own agent sessions, each with its own context window and inference calls.
- Model selection by profile:
  - `subagent_explore`: default subagent model (SWE-1.6 by default)
  - `subagent_general`: same model as parent agent
  - Custom subagents: `model` field in profile if set, otherwise default subagent model
- The default subagent model is chosen by a router at spawn time; with the default **Subagent router** it resolves to SWE-1.6.
- Org admins can override/disable subagents via **Default subagent model** setting.
- "There is no way to name a model for a subagent in a prompt — the `run_subagent` tool takes a profile, not a model."
- Custom profile `model:` is the only way to run a write-capable subagent on a model other than the parent's.

This means: a custom profile with `model: adaptive` should route the subagent to Adaptive, just as `subagent_general` would inherit an Adaptive parent.

## Reproduction attempts

Three fresh Adaptive parent sessions were started with `--model adaptive`. In every session, `sessions.model` was `adaptive` and the parent `generation_model` was `gpt-5-6-sol-low` for all agent steps.

### Attempt 1: 11 sequential subagents

Prompt asked for 11 subagents (READ1-5, WRITE1-3, ARCH, ARCH-SHORT, ARCH-NOWRITE).
Result: parent printed a block claiming all 11 succeeded.
Export analysis: **zero `run_subagent` tool_call steps**. No files were written.
Conclusion: parent model generated all replies inline.

### Attempt 2: 3 explicit subagent calls

Shortened prompt explicitly told the parent to call `run_subagent` three times.
Result: parent printed inline text including "Subagent error: Tool was rejected".
Export analysis: **zero `run_subagent` tool_call steps**. No files written.
Conclusion: parent model still generated inline replies.

### Attempt 3: #1061-style 4 subagents

Used the exact wording style from #1061 ("Use the profile `kwp-adaptive` ... to dispatch four subagents sequentially").
Result: parent printed a block with A success, B/C rejected, D success, plus a meta-observation about files not being created.
Export analysis: **zero `run_subagent` tool_call steps**. No files written.
Conclusion: parent model generated inline replies, including plausible-sounding "rejection" and "observation" text.

## Key finding

In these fresh Adaptive sessions the parent resolved to `gpt-5-6-sol-low`. That model did **not** actually invoke the `run_subagent` tool in any of the three attempts, despite explicit instructions and the tool being present in its catalog.

This stands in contrast to #1061, where the same parent model (`gpt-5-6-sol-low`) **did** emit real `run_subagent` tool_call steps (some succeeded, one was rejected).

## Implication for the original rejection

Because `gpt-5-6-sol-low` inconsistently invokes `run_subagent`, we cannot run a controlled reproduction of the #1061 rejection. The rejection observed in #1061 was real (it came from a real tool_call result), but its determinants cannot be isolated in a fresh session because the model often bypasses the tool entirely.

Most likely causes for the #1061 rejection remain:
1. Transient subagent-spawn or rate limit inside that specific parent session.
2. Tool-permission state accumulated during the session (B's first call was also rejected before retrying).
3. Non-deterministic behavior of the `gpt-5-6-sol-low` backend when routing to subagent infrastructure.

Prompt content, profile model (`adaptive`), and task difficulty are **unlikely** to be the root cause, because the exact same ARCH prompt succeeds when the model does decide to simulate/reply.
