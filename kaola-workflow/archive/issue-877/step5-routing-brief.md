# Step 5 — the routing surfaces

The 30 command/SKILL surfaces are **generated**, not hand-maintained. `scripts/generate-routing-surfaces.js`
renders them from one skeleton per topic in `templates/routing/`, with `TOPICS` declared at
`generate-routing-surfaces.js:78`. So this is *delete two topics, rewrite three, regenerate* — not
30 hand edits. `--check` is a byte-for-byte no-op on a clean tree and is wired into all four chains.

Owner ruling 2026-07-31 — **the command surface collapses to three.**

| topic | today | after |
|---|---|---|
| `plan-run` | 6 surfaces | **deleted** — there is no plan to run |
| `adapt` | 6 surfaces | **deleted** — there is no plan to author or freeze |
| `next` | 6 surfaces | **rewritten** — claims work, then creates and runs the mission list |
| `init` | 6 surfaces | rewritten — light touch |
| `finalize` | 6 surfaces | rewritten — the new door |

## What to do

1. Delete `templates/routing/plan-run.skeleton.md` and `templates/routing/adapt.skeleton.md`, and
   their `TOPICS` entries.
2. Rewrite `next.skeleton.md`, `init.skeleton.md`, `finalize.skeleton.md` onto the mission list.
3. Prune `templates/routing/required-blocks.js` (its `plan-run` and `adapt` obligations, and the
   `docs/plan-run-cards/**` references), `slots.js`, and `rename-table.js` accordingly.
4. `node scripts/generate-routing-surfaces.js --write`, then `--check` must be clean.
5. Delete the 12 rendered surfaces the two dead topics leave behind:
   `commands/kaola-workflow-plan-run.md`, `commands/kaola-workflow-adapt.md`, their gitlab/gitea
   twins under `plugins/*/commands/`, and the `kaola-workflow-plan-run` / `kaola-workflow-adapt`
   SKILL packs under all three `plugins/*/skills/`.
6. Delete `docs/plan-run-cards/` entirely — 10 files, 2,279 lines, every one a DAG rare-branch.

## What `next` must now say

It is the whole workflow now, so it carries what the three commands used to split:

- claim the work (the claim survives — `workflow-state.md` still records issue, branch, worktree);
- **write the mission list**: `kaola-workflow/<run>/mission-list.md`, an H1 carrying the goal and one
  item per mission. Point at `docs/mission-list.md` for the format rather than restating it;
- run it: read the list, pick from the frontier (list minus done minus in-flight), decide *then*
  whether to dispatch subagents or do the work directly, and at what width;
- **the three write moments**, and that `dispatched` is written *before* the work goes out — writing
  it after is the failure the file exists to prevent;
- resume: `in-flight` items with a `dispatched` locator are the decision. Look for the work, not the
  worker — if the promised output has landed, close it; otherwise re-dispatch unless liveness is
  provable.

## What must NOT appear anywhere

No plan grammar, no freeze, no `plan_hash`, no Node Ledger, no roles or write sets, no
post-dominance or gates, no disjointness/antichain/`parallel_safe`, no fan-out cap, no serializer
evidence (S1/S2/S3), no expansion, no epochs or re-plan, no running-set scheduler, and **no typed
refusal codes**. Concurrency carries no machinery at all: the agent decides, uninspected.

## What must appear, because deleting the machinery deleted the mechanism

- **Consent, as prose, in all three topics:** irreversible and value-laden calls belong to the user —
  ask, in conversation, before taking one. The durable valve is gone; this sentence is now the
  entire mechanism.
- **The sink reports; the orchestrator owns the outcome.** In `finalize`: the sink says what it
  found — content on the branch no record describes, a witness bound to different bytes, a merge
  that did not fast-forward — and the orchestrator resolves it: get the merge correct, resynchronize,
  or **file a PR**, then clean up after. Not "merge anyway and report". The change is *who is
  accountable for the branch ending up right*.
- **The finalize validation report:** the chain receipt is measured, not enforced. Report it and let
  the orchestrator decide; it no longer refuses.

## Constraints

- **Provenance rule, enforced by the contract validators:** these surfaces carry the RULE, never its
  origin. No issue refs, no ADR citations, no decision IDs.
- Consumer-facing text names no vendor, no model, and no command that will not resolve on the
  reader's runtime.
- A rule has exactly one wording, and the skeleton is the single source. Never neutralize per
  runtime on the way out; express a genuine capability difference as a named REGION.
- `REGION` vs `SPLICE` is not stylistic: lines ABSENT on some context must be a REGION; lines that
  merely read differently should be a SPLICE. The generator's header explains it.

## Verify

```
node scripts/generate-routing-surfaces.js --check
node scripts/test-generate-routing-surfaces.js
node scripts/test-route-reachability.js
node scripts/validate-workflow-contracts.js
node scripts/test-runtime-lexicon-parity.js
```
All five are green at the campaign baseline. Run one at a time — the corpus is spawn-bound and
concurrent runs produce false reds.
