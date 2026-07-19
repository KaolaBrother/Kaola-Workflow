evidence-binding: c1-scope-timeout-fix 2b57aba7d890
<!-- RED: paste RED here -->
RED: node scripts/test-run-chains.js — 34 new assertions fail pre-impl (199 pass). R1: T38 misclassifies all 10 ROOT cross-edition read surfaces as claude-only/non_edition_diff instead of all-four/edition_coupling — `commands/workflow-init.md` -> got "claude" scope {decision:"claude-only",reason:"non_edition_diff",touchedEditionPaths:[]}; identical for commands/kaola-workflow-plan-run.md, .agents/plugins/marketplace.json, agents/workflow-planner.md, CLAUDE.md, README.md, docs/api.md, docs/workflow-state-contract.md, install.sh, uninstall.sh. R2: T39 the 4x250ms-step chain under an 800ms per-chain budget ran ALL FOUR steps green (duration_ms:1173) with timed_out:false — "the chain was killed BEFORE completing all 4 steps... green steps=4" (per-step timeout, aggregate = steps x timeout).
<!-- GREEN: paste GREEN here -->
GREEN: node scripts/test-run-chains.js — 233 assertions pass. R1: T38 all 10 root cross-edition read surfaces -> chains=[claude,codex,gitlab,gitea], scope.decision=all-four reason=edition_coupling, each recorded in scope.touchedEditionPaths; T38b a genuinely claude-only src/*.js diff still narrows to claude-only. R2: T39 the multi-step chain is killed once cumulative wall-clock passes the per-chain bound (timed_out:true, exitCode:1, <4 green steps). Forge test ports: test-gitlab-run-chains.js 39 + test-gitea-run-chains.js 39 (G7 root-read-surface all-four closure + claude-only preserved; G8 per-chain timeout kill). simulate-workflow-walkthrough.js passed. validate-script-sync + edition-sync --check green (4 run-chains editions in parity: codex byte-identical, gitlab/gitea rename-normalized). Forge chains run end-to-end in this worktree: codex GREEN 17s, gitlab GREEN 85s, gitea GREEN 81s (the edition-touching chains; the claude chain's run-chains step == test-run-chains.js above, plus walkthrough + both parity checks green). Authoritative all-four receipt lands at the c3 finalize sink.

## What changed (7-file write set)

- `scripts/kaola-workflow-run-chains.js` (canonical) + `plugins/kaola-workflow/scripts/kaola-workflow-run-chains.js` (codex byte-twin) + `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-run-chains.js` + `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-run-chains.js` (rename-normalized ports).
- `scripts/test-run-chains.js` + `plugins/kaola-workflow-gitlab/scripts/test-gitlab-run-chains.js` + `plugins/kaola-workflow-gitea/scripts/test-gitea-run-chains.js`.

## R1 — classifier technique + complete root read-surface list

Technique chosen: an EMBEDDED CANONICAL LIST of root cross-edition read-surface CLASSES inside
`isEditionCouplingPath` (self-contained pure path checks — no cross-script import a forge port could
not resolve; the existing codex-mirror filesystem-existence check for `scripts/*` is preserved
alongside). Each entry over-approximates its class (any path under a listed prefix couples), so a
newly-added command/agent/doc/marketplace/profile file is covered without editing the list —
fail-closed by construction.

- `const ROOT_EDITION_READ_PREFIXES = ['.agents/', 'commands/', 'agents/', 'docs/'];`
- `const ROOT_EDITION_READ_FILES = new Set(['CLAUDE.md', 'README.md', 'install.sh', 'uninstall.sh']);`

Complete read surface derived by grepping the root reads of the THREE validators that run
EXCLUSIVELY in non-claude chains (the true fail-open surface — root files whose cross-edition
parity is instead checked by validate-script-sync/edition-sync are caught by the CLAUDE chain and
are NOT fail-open, so excluded):
- codex chain `validate-kaola-workflow-contracts.js`: `.agents/plugins/marketplace.json`,
  `commands/workflow-init.md` (KW-CLAUDE-TEMPLATE byte-parity), `commands/kaola-workflow-plan-run.md`,
  `agents/workflow-planner.md`, `CLAUDE.md` (line-count + durable-state concept), `README.md`,
  `docs/api.md`, `docs/workflow-state-contract.md`.
- gitlab chain `validate-kaola-workflow-gitlab-contracts.js`: `agents/workflow-planner.md`
  (adaptive-authoring concept), `install.sh` (spawned), `.agents/plugins/marketplace.json`.
- gitea chain `validate-kaola-workflow-gitea-contracts.js`: `agents/workflow-planner.md`,
  `uninstall.sh` (read), `.agents/plugins/marketplace.json`.

The two reported instances (`commands/workflow-init.md`, `.agents/plugins/marketplace.json`) are
covered by the `commands/` and `.agents/` prefixes. `docs/conventions.md` (referenced by all three
validators) is covered by the `docs/` prefix.

## R2 — per-chain wall-clock budget

`runChainSteps` now records a `chainStart = Date.now()` origin and passes each step's spawn only the
REMAINING per-chain budget (`timeoutMs - (Date.now() - chainStart)`) instead of the full `timeoutMs`.
When the budget is already spent before a step, the chain is killed there (synthetic timed-out step,
never a fresh full timeout); otherwise the step's own spawn timer (now the remaining budget) fires
mid-step. Either way the chain is marked `_timedOut`/`timed_out: true`, restoring the header's
documented PER-CHAIN contract (was steps x timeout). A single-step (mocked) chain still gets
effectively the full budget, so T21/T24/T26-T28 are unchanged.

## Cross-edition / scope notes

- Canonical edited; codex twin byte-copied; gitlab/gitea ports regenerated via the repo's own
  `renameNormalize` (forge classifier `require()` correctly renamed). No `package.json` edit, no docs
  edit — the CLAUDE.md diff-scope prose and CHANGELOG stay accurate (R1 only recognizes more
  edition-touching paths under the already-documented rule; R2 restores the run-chains header's own
  per-chain contract).
- Tie-breaker (First Principles): CLAUDE.md/README.md/docs/* are also read by the CLAUDE chain, but
  the non-claude validators assert edition-specific content on them; unable to cheaply prove the
  claude-chain assertions are a superset, axiom 1 (Correct first) dictates fail-closed inclusion —
  the cost of occasionally running four chains on a docs-only change (axiom 3) is far below a
  false-green finalize.
- Deviation/discovered gap: the existing tests used `README.md` as the "claude-only" stand-in, which
  is itself a codex-chain read surface (a narrower instance of the same R1 class). Switched
  makeScopeRepo + T33/T36/T37 (and forge G5) to a genuinely claude-only `src/app.js` and added
  T38b/G7 asserting a real source diff still narrows to claude-only. No out-of-write-set change was
  required.
