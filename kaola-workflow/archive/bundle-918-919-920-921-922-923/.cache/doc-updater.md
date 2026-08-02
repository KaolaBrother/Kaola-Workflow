# doc-updater — SKIPPED WITH REASON

**Not dispatched.** The documentation for this bundle was authored inline by the orchestrator, against
measured ground truth, before the implementation commit and before `run-chains`.

## Why skip rather than dispatch

Every documentation surface this bundle touches is a **structured, verifiable** one — the finalize
envelope's field table in `docs/api.md`, the per-edition finding-type counts, and the emitting-edition
scope of two envelope fields. Those are exactly the sections where a doc pass that infers rather than
transcribes produces confident, wrong field semantics, and the wrongness is invisible to every chain
because no test reads that prose.

The content was instead derived from measurement already recorded in this run:

- `archive_unstaged` is canonical + Codex only — token counts measured 1/1/0/0 across the four
  editions, and the claim is now additionally **enforced behaviourally** by
  `scripts/test-forge-finalize-findings.js`, whose static arm reds if `docs/api.md` and the ports
  disagree. The documentation is therefore pinned, not asserted.
- `residue_unstaged` is genuinely 1/1/1/1 and is marked all-four.
- The six-versus-seven finding-type counts were re-verified and left unchanged; only their stated
  *reason* moved, because this bundle's own #922 fix falsified the old one.

## Surfaces updated, and by what authority

| surface | change | ground truth |
|---|---|---|
| `CHANGELOG.md` `[Unreleased]` | Removed/Fixed/Changed entries for all six issues | this run's measurements |
| `docs/api.md` | `archive_unstaged` edition scope + measured-set semantics; `residue_unstaged` marked all-four; edition caveat's rationale rewritten | measured counts; pinned by the static arm |
| `kaola-workflow/ROADMAP.md` | regenerated with the script, never hand-edited | `roadmap.js generate`; `validate` → ok |

## Not owed

No routing surface was regenerated and none was owed: #918 moved the **generators** to match
surfaces that were already correct, so no `templates/routing/` skeleton changed.
`generate-routing-surfaces.js --check` runs in all four chains and stayed green.

`docs/conventions.md` earned no new rule. Both candidate observations from this run are instances of
rules it already carries — *specify the result, never the method* (#920) and *find the ancestor
sentence first* (#918) — and adding a fresh row restating an existing rule is the kind of accretion
this project's charter explicitly refuses.
