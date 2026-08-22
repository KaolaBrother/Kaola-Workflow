# Adversarial verification — issue #1014

behavior: adversarial-verifier
behavior_contract_version: 3
behavior_contract_hash: efb8f28ba39b96d87ad7986705629c1c133e71747fa6c30d9270e57003f3883c
resolved_profile_hash: 68affd2a6c8f898fdc0fc3454103472978936d7630a2f1f3d0f45b4f271efeb2

## Context and candidate

- Worktree: `/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/.kw/worktrees/issue-1014`
- Candidate: `019a4062e7e4f8979e78f9eb36fe8d63700e51e3` vs main `3a289108`
- Issue: https://github.com/KaolaBrother/Kaola-Workflow/issues/1014
- Plan of record: comment `5380834329`
- Measurement: `kaola-workflow/issue-1014/measure-locators.md` (pre-fix tree at `3a289108`)
- Live evidence: `kaola-workflow/issue-1014/.cache/live-cursor.md`
- Suites: `kaola-workflow/issue-1014/suites-green.md`
- Evidence file: `kaola-workflow/issue-1014/.cache/adversarial.md`

execution: succeeded

## Exact claim

The six conjuncts supplied in the dispatch, unchanged:

1. `/workflow-next` on Cursor will now name Kaola Task types and omit model (including inherit) so #1013 pins fire.
2. `--global` dual-write is what Probe B needed, and `--global` from `$HOME` without git does not invent a project tree.
3. Fail-closed (no `generalPurpose` impersonation) is actually taught and guarded.
4. Adding `## Agent Model Dispatch` to next did not regress Claude (must pass `model=`), Codex (Delegation unchanged, T19 needles absent), Grok/opencode/kimi generators.
5. Live Probe 23 envelopes (medium vs high) are the resolved Task envelope like #1013, not an authored `Task(model=)` workaround.
6. GREEN cannot lie: pins mutation-proven vs vacuous.

## Exact surface

Tracked diff `3a289108..019a4062` in the issue-1014 worktree; generated Cursor/Grok/opencode/kimi trees under the main-checkout `TREE_ROOT`; live probe streams under `kaola-workflow/issue-1014/.cache/`; Layer 4 pins in `scripts/test-cursor-edition.js` and the three contract validators.

## Analytical result

`refuted` — execution succeeded. Confidence: high.

Conjunct 6 is broken by a concrete GREEN-stays-green weakening. Conjunct 1’s live success path never isolated `/workflow-next` as the instruction source (intrinsically non-decisive for that isolation). Conjuncts 2–5 survived the counterexample searches below.

Because the dispatch tied all six conjuncts to the change under consideration, this is not a passing non-refutation.

## Counterexamples attempted and observed

### 1. `/workflow-next` names types and omits model so #1013 pins fire

Attempted:

- Read generated `.cursor/commands/workflow-next.md` (main-checkout `TREE_ROOT`). Heading `## Agent Model Dispatch` is substituted for `CURSOR_MODEL_DISPATCH_BLOCK`. The card names `subagent_type: "<role>"`, says omit per-call model including `inherit`, forbids `generalPurpose`, and carries catalog preflight / Invalid-enum fail-closed. Grep finds no `model="`.
- Canonical Claude `commands/workflow-next.md` (and gitlab/gitea twins) now carry `## Agent Model Dispatch` with `You MUST pass \`model=`` and no `model="{`.
- Probe 23 workspace still on disk: 14 agents; `implementer.md` has `model: grok-4.6[effort=medium]`; `code-reviewer.md` has `model: grok-4.6[effort=high]`. Stream SHA-256 matches `live-cursor.md`: `5d5e9801bd7adfb4994ee0a20554e2dbd84d289bf0a24c18fd2951373e431dd7`.
- Probe 23 parent (`223ae129-3773-4112-a841-02f14851bee6`, Cursor Grok 4.6 Extra High) dispatched custom `implementer` and `code-reviewer`. Envelopes resolved `cursor-grok-4.6-medium` vs `cursor-grok-4.6-high`. No `generalPurpose`.

Did not break the teaching or the pin-fire path.

Live isolation failed: Probe 23’s user event is a measurement prompt (“dispatch one fresh custom implementer Task and one fresh custom code-reviewer Task. Omit the model argument… Do not pass inherit. Do not substitute generalPurpose”), not `/workflow-next` and not “read the generated next card.” Same prompt shape as #1013 close evidence. Plan of record allowed “`/workflow-next` (or the generated next card + a real dispatch)”; Probe 23 is the second disjunct without the card. No counterexample of a `/workflow-next` parent passing `inherit` or impersonating. Incomplete confirmation of the slash-command success path — not a concrete refutation of the card+catalog mechanism.

Conjunct 1: mechanism not broken; live slash-command isolation `indeterminate`.

### 2. `--global` dual-write is what Probe B needed; no invented tree from `$HOME` without git

Probe B’s measured requirement was workspace `.cursor/agents` in the Task enum (not `~/.cursor/agents`). Dual-write from a git cwd produces that catalog.

Attempted (this verifier, worktree `install-cursor.sh`):

- Git fixture cwd + hermetic `CURSOR_HOME`: installer printed `Task types are workspace-scoped; also deploying…`; 14 agents at `<toplevel>/.cursor/agents` including `implementer.md`; 14 un-nested under `$CURSOR_HOME/agents`; no `$CURSOR_HOME/.cursor`.
- Non-git cwd: `$CURSOR_HOME/agents/implementer.md` present; **no** `cwd/.cursor`.
- Fake `$HOME` as cwd, `CURSOR_HOME=$HOME/.cursor`, no git: global dest `$HOME/.cursor/agents/implementer.md` present; **no** `$HOME/.cursor/.cursor`; `$HOME` contains only `.cursor` (the global home, not a second project tree).
- Probe 23 install log already showed the same dual-write into `/private/tmp/kw-cursor-1014-probe23.f5IY91/.cursor`.
- G8-global-nongit pin exists; it was a lock of already-true behavior (not in the tdd-red 22 FAILs). Independent installer runs above re-prove it.

No counterexample. Conjunct 2: `not_refuted`.

### 3. Fail-closed taught and guarded

Taught: generated next/finalize/init all carry “Do not substitute `generalPurpose`… impersonation is the bug” and “Do not retry as `generalPurpose` / `inherit`.” Canonical Claude next says never substitute a generic type; do the work inline.

Guarded: tdd-red recorded 22 cursor-edition FAILs on `3a289108`, including the `generalPurpose` / Invalid-enum / sentinel / new-chat needles on the constant, generated next, and generated finalize. Contract validators threw on missing next heading.

Live Probe 4: SHA-256 `c02cff081f729e264b4f1e609ac38bafb85b3309e23b1c65378e80806850a71b`. Zero `taskToolCall` events. Parent read `.cursor/commands/workflow-next.md`, printed `./install-cursor.sh --target "$PWD"`, told the operator to start a new chat. Workspace still had no `.cursor/agents/` after the chat.

Confound (does not break the conjunct): Probe 4’s user prompt also said “Do not substitute generalPurpose. Do not pass inherit.” The live tape does not isolate the card from the probe prompt. The parent did read the card and quoted its fail-closed path. No `generalPurpose` tool call occurred.

No counterexample of impersonation. Conjunct 3: `not_refuted`.

### 4. Heading on next did not regress Claude / Codex / Grok / opencode / kimi

Attempted:

- `node scripts/generate-routing-surfaces.js --check`: all 18 surfaces byte-match. Expensive grok/opencode/kimi/walkthrough re-runs short-circuited after conjunct 6 was already refuted.
- Claude command next (three forges): `You MUST pass \`model=`` present; `model="{` absent. `phaseCommands` is still finalize-only, with an explicit assert that next is not folded in.
- Claude finalize still has `You MUST pass \`model="{...}"`` and `model="{TDD_GUIDE_MODEL}"` / sibling placeholders.
- Codex `kaola-workflow-next` skills: `git diff 3a289108..HEAD` is **empty** (0 lines). `## Delegation` still requires explicit `model` and `reasoning_effort`. `## Agent Model Dispatch` absent. T19 `hasProfileOwnedDispatchConflict` false on all three forge next skills.
- Codex init skills: overlay rewrite only (plan sentence); T19 universe is next/finalize skills, and KW-CLAUDE-TEMPLATE is stripped for that universe.
- Grok generated next: heading replaced by existing `GROK_MODEL_DISPATCH_BLOCK` (`## Model is inherited; effort follows the role`; `spawn_subagent`; `subagent_type: "<role>"`).
- opencode generated next: `## Model and effort are inherited` (S2 inherited-effort block).
- kimi `.kimi/skills/workflow-next/SKILL.md`: Consent then `## Step 1` — Claude `## Agent Model Dispatch` not retained.

No regression counterexample on this surface. Conjunct 4: `not_refuted`.

### 5. Probe 23 envelopes are resolved #1013 carriers, not authored `Task(model=)`

Attempted:

- Stream `taskToolCall.args` for both started/completed pairs include `model` **alongside** `agentId`, `mode`, `environment`, `attachments`, `respondingToMessageIds` — the same runtime envelope bag #1013 treated as injected, not as authored Task-card fields.
- Distinct values: `implementer` → `cursor-grok-4.6-medium`; `code-reviewer` → `cursor-grok-4.6-high`. Parent init model is Extra High (`xhigh`). Inherit-from-parent or picker-variant authorship would not produce that split.
- On-disk frontmatter in the Probe 23 workspace still matches: medium vs high raw Grok 4.6 pins.
- `subagentType.custom.name` is `implementer` / `code-reviewer`, not `generalPurpose`.
- User prompt and parent final text both claim the authored calls omitted `model`. Plan of record: Task `model` enum does not offer the two-tier slugs; call-site `Task(model=cursor-grok-4.6-medium)` is not a backup.
- Probe A control (SHA-256 `fa10d149bde2f8a0fe3819a7dea79812d490038ad58f3e96c65da845a93aa916`) still schema-rejects `implementer` when the workspace catalog is empty, with no `generalPurpose` retry.

Did not obtain Cursor `store.db` authored-arg split (used in #1013 adversarial). Stream format plus the medium/high split from an xhigh parent is the same carrier #1013 accepted. No evidence of an authored `Task(model=)` workaround.

Conjunct 5: `not_refuted`.

### 6. GREEN cannot lie (mutation-proven vs vacuous)

tdd-red on `3a289108` did mutation-prove **total absence**: 22 new cursor-edition FAILs (heading, inherit token, `generalPurpose`, sentinel, cold-start, Invalid-enum, generated-block identity, G8-global-git, G9 export) plus contract validators throwing on missing next heading. Overlay exact-string pins were queued behind that first throw, not independently printed.

That is not the same as “any weakening of the inherit-omit teaching reds.”

**Counterexample A (inherit-omit teaching).** `assertStrengthenedDispatch` for inherit is two independent regexes ANDed: `/\binherit\b/i` and `/omit|do not pass|never pass/i`. `includes(CURSOR_MODEL_DISPATCH_BLOCK)` against the constant itself is tautological. This verifier deleted only the sentence `Omit per-call model on \`Task\`, including \`inherit\`. Do not pass inherit.` and left `Omit per-call model on \`Task\`.` plus `Do not retry as \`generalPurpose\` / \`inherit\`.` Needles-only: **PASS**. Regenerating from that weakened constant would keep `body.includes(block)` green because `block` is the weakened constant. GREEN therefore does not lie about *absence of the word inherit*; it **does** stay green after the specific “do not pass inherit” teaching is removed. tdd-red never exercised that weakening (the old block had zero inherit tokens).

**Counterexample B (catalog-copy-only-canon).** Plan Layer 4 mutation: stray `user-agent.md` in `CURSOR_HOME/agents` is not copied. `copyListCanonAgents` is defined and exported in `scripts/sync-cursor-edition.js` and called only from `scripts/test-cursor-edition.js`. Installer dual-write uses bash `copy_agents` over `$SOURCE_TREE/agents/*.md` (generated tree). `transformCommandBody` does not call the helper. Catalog preflight copy is agent-executed prose. G9 can be green while no production copy path is bound to `listCanonAgents()` names.

G8-global-nongit was already true on main (lock; not in the 22 FAILs). Not a lie; not a proof of the new dual-write either.

Conjunct 6: `refuted` by A and B.

## Findings

finding: id=R1 scope=in_scope action=fix status=open severity=medium fix_role=tdd-guide rationale=inherit-omit teaching can be deleted from CURSOR_MODEL_DISPATCH_BLOCK; G2 needles stay green because inherit remains on the Invalid-enum line and omit remains on Omit per-call model.
finding: id=R2 scope=in_scope action=fix status=open severity=medium fix_role=tdd-guide rationale=G9-catalog mutation-proves an unused copyListCanonAgents helper; installer and command transform never call it, so GREEN does not bind catalog-copy-only-canon on the production copy path.

## Per-conjunct scoreboard

| # | conjunct | result |
|---|---|---|
| 1 | `/workflow-next` names types, omits model/inherit, pins fire | mechanism `not_refuted`; live slash-command isolation `indeterminate` |
| 2 | `--global` dual-write = Probe B catalog; no invented tree | `not_refuted` |
| 3 | fail-closed taught and guarded | `not_refuted` |
| 4 | no Claude/Codex/Grok/opencode/kimi regression | `not_refuted` |
| 5 | Probe 23 envelopes are #1013 resolved carriers | `not_refuted` |
| 6 | GREEN cannot lie | `refuted` |

verdict: fail
findings_blocking: 2
