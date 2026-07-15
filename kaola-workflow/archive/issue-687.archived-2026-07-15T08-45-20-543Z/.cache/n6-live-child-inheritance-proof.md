evidence-binding: n6-live-child-inheritance-proof 12c1b2a20bad
verdict: pass
findings_blocking: 0
outcome: live_parent_child_inheritance_proved
instrumentation: none
upstream_read: n5-code-review 5b2d537a2a9b

# Live Codex parent/child inheritance proof

## Bound runtime

- Codex CLI: `0.144.3`.
- Parent session: `019f64c8-f72c-7813-a410-322ac72e3094`.
- Child session: `019f64c9-27e0-7360-b0a7-437165547203`.
- Child linkage: `parent_thread_id` exactly equals the parent ID, `thread_source:"subagent"`, role `code-explorer`, nickname `Scout`, task path `/root/issue687_live_probe_final`.
- Exactly one child JSONL was linked to this parent.

## Spawn contract

The durable parent rollout recorded this exact call input:

```js
const r = await tools.agents__spawn_agent({
  agent_type: "code-explorer",
  task_name: "issue687_live_probe_final",
  fork_turns: "none",
  message: "Return exactly probe-complete."
});
```

The call contains neither `model` nor `reasoning_effort`; the selected role identity and non-full-history fork are explicit.

## Persisted turn context

| Session | JSONL timestamp | model | effort |
|---------|-----------------|-------|--------|
| parent | `2026-07-15T07:58:45.728Z` | `gpt-5.6-sol` | `xhigh` |
| child | `2026-07-15T07:58:54.177Z` | `gpt-5.6-sol` | `xhigh` |

Both child values exactly equal the parent values.

## Candidate-profile binding

- The scratch profile symlink resolved to the candidate worktree file `plugins/kaola-workflow/agents/code-explorer.toml`, not the globally installed profile.
- Scratch target and candidate file both had SHA-256 `0b37279245a670df2ab97c268372c64889443c859e4bc907c64b055fd718e5b3`.
- The child rollout embedded the candidate's unique developer instruction `You are the code-explorer role for Kaola-Workflow for Codex.` and selected its `Scout` nickname, proving the candidate profile was loaded.
- The candidate profile contains neither top-level runtime key.

## Mechanical all-profile proof

- `rg` found zero executable `model` or `model_reasoning_effort` lines across all three role trees.
- `node scripts/test-agent-profile-parity.js` passed 215 assertions, covering all 48 profiles and byte-identical same-role triples.

## Bounded caveat and cleanup

The child persisted its complete identity and `turn_context` before its response stream later reported an encrypted-function-output transport error. That response-text failure is outside this gate's acceptance predicate: spawn succeeded, the candidate identity was durably bound, every required runtime field was present, and the inherited pair matched exactly. The parent observed the child's terminal result. Both external scratch directories, including their rollout JSONLs and authentication symlink, were removed after the bounded fields and hashes above were retained.

## Verdict

PASS — a named candidate role with no runtime pins inherited both values from the live parent session with no transient pair override.
