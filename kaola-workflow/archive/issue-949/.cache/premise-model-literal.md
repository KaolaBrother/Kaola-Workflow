# Investigation: is the rendered `model="..."` literal in `kaola-workflow-finalize` functional or cosmetic?

## VERDICT: **FUNCTIONAL**

Removing the literals changes which model at least two of the three roles run on. Directly observed,
same-role A/B, in this repository's own session transcripts.

| role | card renders | with the literal (observed) | with the literal removed |
|---|---|---|---|
| `doc-updater` | `model="sonnet"` | **`claude-sonnet-5`** | **`claude-opus-5`** — both legs directly observed |
| `tdd-guide` | `model="sonnet"` | `claude-sonnet-5` (observed for the alias, 15 dispatches) | `claude-opus-5` — 3 no-model `tdd-guide` dispatches observed, all opus |
| `build-error-resolver` | `model="opus"` | `claude-opus-5` | `claude-opus-5` **iff the session model is opus**; otherwise the session model. Non-opus parent sessions are real in this repo's history (4 sessions ran `claude-fable-5` / `claude-opus-4-8` as parent). |

The literal is *both* the badge trigger and the effective-model override. They are the same mechanism,
not two. `resolve-agent-model.js` is **not** what governs a Claude Code dispatch.

---

## Setup

- Commit under measurement: `a348ff5c683845c212d15bdcac1740c640809f9b` (main and
  `.kw/worktrees/issue-949` are at the same commit; branch `workflow/issue-949`).
- Working tree clean apart from the untracked `kaola-workflow/issue-949/`. **No tracked file in
  either tree was modified** — verified after the fact with `git diff --name-only HEAD` (empty).
- Runtime measured: Claude Code **2.1.226**, real binary
  `/Users/ylpromax5/.local/node-v24.14.0-darwin-arm64/lib/node_modules/@anthropic-ai/claude-code/bin/claude.exe`.
- Session model configured in `~/.claude/settings.json`: `"model": "opus[1m]"`.
- Scratch: `/private/tmp/claude-501/-Users-ylpromax5-Workspace-Kaola-Workflow/f850139c-e3c6-4391-be0f-fedc312a0b1b/scratchpad/model-literal/`
  (`sandbox/` = isolated-HOME install, `mirror/` = mutation mirror, `*.js` = analysis scripts).

---

## 1. Consumer trace — who reads a `model=` line out of an installed command file?

**Nobody at runtime. OBSERVED.**

| probe | command | result | exit |
|---|---|---|---|
| `model=` anywhere in the installed tree's scripts/hooks | `grep -rn --include='*.js' --include='*.sh' --include='*.json' --include='*.toml' 'model=' <sandbox>/.claude/kaola-workflow/ <sandbox>/.claude/hooks/` | **exactly one hit**: `kaola-workflow-resolve-agent-model.js:287`, which is `formatAgentArgument` — a *producer* of the string, not a parser of the command file | 0 |
| callers of that producer | `git grep -n -P 'formatAgentArgument\|--agent-arg'` | no caller anywhere in the repo outside the script's own `main()` and its tests; `--agent-arg` is invoked by nothing | 0 |
| the SubagentStart hook | read `hooks/kaola-workflow-subagent-dispatch-log.sh` | reads `p.model` off the **runtime JSON payload**, never off a command file; computes `model_planned` by shelling to the resolver | — |
| the hook's payload in practice | `cat kaola-workflow/issue-949/.cache/dispatch-log.jsonl` | `{"agent_type":"modelliteral",...,"model":"","model_planned":""}` — Claude Code's SubagentStart payload carries **no** model, confirming the hook's own comment at `:19-20` | 0 |

The remaining `model=` references in the repo are all **non-runtime**: `install.sh` (writes it at
install time, `:525-580`), `validate-workflow-contracts.js` + the gitlab/gitea mirrors (read the
*source* placeholder form), `sync-opencode-edition.js` / `sync-kimi-edition.js` (strip it when
generating those editions), and test files.

**INFERENCE (high confidence):** the three literals are consumed **only by the agent reading the
prompt**. They are an instruction to the orchestrator about what to pass on its `Agent(...)` call —
they sit inside ```text fences in a slash-command's prose, which no parser touches.

That is *not* the same as cosmetic. The question is what happens when the orchestrator obeys.

---

## 2. Sandbox install — what actually ships

`HOME=<scratch>/home bash install.sh --yes --forge=github --no-settings-merge` → **exit 0**.

| item | value | exit |
|---|---|---|
| rendered literals in `<sandbox>/.claude/commands/kaola-workflow-finalize.md` | `:87 model="sonnet"`, `:96 model="opus"`, `:155 model="sonnet"` | 0 |
| any other `model=` across installed commands | none — the three, plus the `## Agent Model Badge` prose at `:31-33` | 0 |
| frontmatter `model:` for `tdd-guide` / `build-error-resolver` / `doc-updater` | `inherit` / `inherit` / `inherit` | 0 |
| `kaola-workflow-resolve-agent-model.js <role> --raw` from the sandbox | `sonnet` / `opus` / `sonnet` | 0 each |

Cross-edition: `plugins/kaola-workflow-gitlab` and `-gitea` carry the same three placeholders. The
Codex plugin (`plugins/kaola-workflow`) has **no** `commands/kaola-workflow-finalize.md` at all, and
**no `SKILL.md` on any edition carries `model=` or `## Agent Model Badge`.** So the literals are
Claude-command-surface-only. Installed `~/.codex/...`, `~/.config/opencode/`, `~/.kimi-code/` carry
none (the single `~/.kimi-code` hit is an unrelated session plan file, not an installed surface).

---

## 3. THE DISCRIMINATING TEST — observed, not inferred

Claude Code writes each subagent's own transcript to
`~/.claude/projects/<slug>/<session>/subagents/agent-*.jsonl`, with a sibling `*.meta.json` that
records `agentType`, `toolUseId`, and — **only when the dispatch carried one** — the `model`
parameter. Every assistant message carries `message.model`. That gives the requested model and the
model actually used, per dispatch, with no self-report involved.

Population: **283 subagent transcripts** across 50 sessions of this project.
Script: `scratchpad/model-literal/ab.js`, exit 0.

### A. Dispatches that carried `model=` (n = 249)

- Model family of the model actually used equals the requested family: **247 / 249**.
- **The discriminating subset** — requested family ≠ parent family (n = **71**):
  **69 followed the request, 2 followed the parent.**

The 2 exceptions are both `model="fable"` in one 2026-07-20 session (`52021b80`), where other
`fable` requests in the *same* session succeeded. The shipped binary explains it: it carries a
`subagent_model_resolve` path with the string `Subagent model "<x>" is not in the availableModels
allowlist; ` followed by either `using the newest allowed model in its family` or **`inheriting the
parent model`**, plus telemetry outcomes `family_alias_stepped_down` / `override_dropped` /
`family_mismatch`. An override for a model outside the allowlist falls back to the parent. Neither
exception involves `sonnet` or `opus` — the only two aliases the three literals render to.

### B. Dispatches that carried **no** `model=` (n = 34)

- Ran on a family the **parent session** used: **34 / 34.**
- Ran on the `DEFAULT_AGENT_MODELS` tier: 8 / 34 — and all 8 are cases where the map tier happened
  to equal the parent family anyway.
- **The discriminating subset** — role's map tier ≠ parent family (n = **22**):
  **22 / 22 ran on the PARENT model. Zero ran on the map tier.**

```
6b1260d0 code-explorer  mapTier=sonnet parent=fable ACTUAL=opus   (x3)
ad8c303e investigator   mapTier=sonnet parent=opus  ACTUAL=opus   (x4)
bbc1c516 implementer    mapTier=sonnet parent=opus  ACTUAL=opus   (x3)
bbc1c516 tdd-guide      mapTier=sonnet parent=opus  ACTUAL=opus
bbc1c516 investigator   mapTier=sonnet parent=opus  ACTUAL=opus   (x3)
e5bef84f implementer    mapTier=sonnet parent=opus  ACTUAL=opus   (x2)
e5bef84f tdd-guide      mapTier=sonnet parent=opus  ACTUAL=opus   (x2)
e5bef84f doc-updater    mapTier=sonnet parent=opus  ACTUAL=opus
f20f411f code-explorer  mapTier=sonnet parent=opus  ACTUAL=opus   (x2)
```

### C. The exact A/B, same role, same task shape

```
bbc1c516  doc-updater  dispatch=sonnet     actual=claude-sonnet-5  parent=claude-opus-5  | "Update docs for issue-935"
e2e7977c  doc-updater  dispatch=opus[1m]   actual=claude-opus-5    parent=claude-opus-5  | "Update docs for the bundle"
e5bef84f  doc-updater  dispatch=<ABSENT>   actual=claude-opus-5    parent=claude-opus-5  | "Update docs for 927"
```

**Provenance of the `bbc1c516` leg is direct, not circumstantial.** That session's transcript
contains the finalize command surface expanded into context at `2026-08-10T09:41:52Z` — including
the verbatim `## Agent Model Badge` paragraph and the `You MUST pass model=` sentence. 1m54s later,
at `2026-08-10T09:43:46.432Z`, the orchestrator issued `toolu_01CGCZaqFnFYqe74BERdRkxp`:
`subagent_type="doc-updater", model="sonnet", description="Update docs for issue-935"` — exactly the
card at `:151-157`. Its subagent transcript `agent-a88f8c87973d9c91e.jsonl` records **80 assistant
messages, all `claude-sonnet-5`**, while the parent ran `claude-opus-5` throughout.

In the same session, every other subagent (`implementer` x3, `tdd-guide`, `investigator` x3) was
dispatched **without** a `model=` and every one ran on `claude-opus-5`.

**This is the literal, executed, changing the model.**

---

## 4. What governs — settled

| candidate | verdict |
|---|---|
| (a) the literal the orchestrator copies into its dispatch | **GOVERNS.** 69/71 discriminating overrides honored; the doc-updater A/B is decisive |
| (b) installed frontmatter (`inherit`) | **Governs only in the absence of (a)** — `inherit` means "match the parent/spawning conversation". 34/34 no-model dispatches ran on a parent model |
| (c) `resolve-agent-model.js` / `DEFAULT_AGENT_MODELS` | **Does not govern a Claude Code dispatch at all.** 22/22 discriminating cases ignored it. It governs the *other* runtimes (Codex per-spawn effort, opencode reasoning-role derivation) and the hook's advisory `model_planned` field |

Documented corroboration, extracted from the shipped binary (**DOCUMENTED, not inferred** — these
are the runtime's own schema description strings, `strings -a` on claude.exe 2.1.226):

- agent-definition `model` field: `Model override for this agent. Use \`inherit\` to match the
  spawning conversation.`
- `Model alias this agent uses. If omitted, inherits the parent's model` — adjacent to
  `Information about an available subagent that can be invoked via the Task tool.`
- `Model alias (e.g. 'fable', 'opus', 'sonnet', 'haiku') or full model ID … If omitted or 'inherit',
  uses the main model`
- `Model override (\`haiku\`, \`sonnet\`, \`opus\`, \`fable\`, or a full ID). Use \`inherit\` to
  match the parent conversation.`

The documentation and the 283-transcript observation agree exactly.

---

## 5. `assertEveryDispatchHasModel` — load-bearing, mutation-proven

`scripts/validate-workflow-contracts.js:70`, invoked at `:182` over `phaseCommands`, which is now
exactly one file: `commands/kaola-workflow-finalize.md`. Mirrored at
`validate-kaola-workflow-gitlab-contracts.js:79/:207` and `-gitea-contracts.js:78/:206`.

Mutation proof on a scratch mirror (`git archive HEAD | tar -x`), one literal deleted per leg,
mirror restored between legs:

| leg | validator exit | assertion that fired |
|---|---|---|
| baseline (unmutated) | **0** | `Workflow contract validation passed` |
| drop `model="{DOC_UPDATER_MODEL}",` | **1** | `…finalize.md has an Agent( dispatch block at line 153 missing a model="{..._MODEL}" line` |
| drop `model="{TDD_GUIDE_MODEL}",` | **1** | `…at line 85 missing a model="{..._MODEL}" line` |
| drop `model="{BUILD_ERROR_RESOLVER_MODEL}",` | **1** | `…at line 94 missing a model="{..._MODEL}" line` |
| restore | **0** | passed again |

**The guard is armed on all three, and its `CHANGELOG.md:3950` rationale is accurate as written:**
under `inherit`, a dropped `model=` does silently run the agent on the parent model. That is not a
theory — it is section 3B, 22 times.

Removing the three literals does **not** leave the guard vacuous; it leaves it **failing**. It would
have to be deleted with its subject (CLAUDE.md: *a test is deleted with its mechanism, never repaired
ahead of it*). Also measured: deleting all three literals *and* the `## Agent Model Badge` section
still exits 1, on `must include: ## Agent Model Badge` (`:178`) — plus `:196-201` pins
`model="{BUILD_ERROR_RESOLVER_MODEL}"` and `model="{TDD_GUIDE_MODEL}"` by literal across all three
forge command copies. So the removal touches at least 5 assertion sites in 3 validators.

---

## Inferences, labeled

- **The `model=` literal is the effective-model override, not a badge trigger with a separate
  mechanism behind it** — confidence: very high (OBSERVED, n=71 discriminating + a same-role A/B +
  the runtime's own schema strings). Refuted by: a dispatch carrying `model="sonnet"` whose subagent
  transcript records a non-sonnet model, with the alias inside the availableModels allowlist.
- **The prose at `commands/kaola-workflow-finalize.md:31-33` is inaccurate in one respect** —
  INFERENCE, high confidence. It says the literal "is what shows the model badge", framing the badge
  as the purpose. The badge is a *side effect* of the override; the override is the mechanism. If the
  removal proposal was reasoning from that sentence, it was reasoning from an incomplete premise.
  This is a justification defect, and per the owner's ruling it is the *justification* that should
  change — not the literal.
- **`DEFAULT_AGENT_MODELS`' header comment ("THIS MAP IS THE EFFECTIVE TIER OF EVERY INSTALLED
  AGENT") is false for Claude Code** — INFERENCE, high confidence, from 22/22. It is true for what
  that script computes and for the runtimes that consume the script; it is not true of a real Claude
  Code dispatch, where the map is consulted by nobody. The comment's own second half is correct
  ("resolution always lands here") — it is the first sentence's scope claim that overreaches.
  **This is a separate finding from the question asked and I did not act on it.**

## Open / not settled

- **I could not run a fresh live A/B myself.** I have no Agent/Task tool in this role, so I could not
  dispatch a throwaway subagent at `model="haiku"` against a control. I did not need to: the historical
  transcripts contain 71 such legs already, including the exact card under question. Stated so the
  substitution is visible rather than silent.
- **The 2 `fable` non-overrides** are explained by a shipped allowlist-fallback string, not by a
  measurement I ran against that session's allowlist. The allowlist at 2026-07-20 is not recoverable
  from here. Neither alias in question (`sonnet`, `opus`) is implicated.
- **`build-error-resolver`'s literal is a no-op at an opus session** and only bites at a non-opus one.
  I did not find a finalize-sourced `build-error-resolver` dispatch in the transcripts (it is the
  routed-fix card — it only fires when validation fails), so its effect is established by the general
  mechanism rather than by its own observed instance.
- Whether the badge *rendering* would also disappear is untested — I measured effective model, not UI.
  It does not matter to the ruling: the mechanism is functional either way.

## Bottom line for the removal decision

The owner's ruling is "cosmetic redundancy is deleted, functioning mechanism is kept." This is
functioning mechanism. Deleting the three literals would move `tdd-guide` and `doc-updater` from
`claude-sonnet-5` to whatever the session runs (opus, by this repo's configured default) on every
finalize, and would silently un-pin `build-error-resolver` from opus in any non-opus session.

**Keep the literals. Fix the justification** at `:31-33` — it should say the literal *sets* the
dispatched model (the badge being the visible consequence), not that it exists to show a badge.
