# Adversarial verification — issue #1016

behavior: adversarial-verifier
behavior_contract_version: 3
behavior_contract_hash: efb8f28ba39b96d87ad7986705629c1c133e71747fa6c30d9270e57003f3883c
resolved_profile_hash: 68affd2a6c8f898fdc0fc3454103472978936d7630a2f1f3d0f45b4f271efeb2

## Context and candidate

- Worktree: `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-1016`
- HEAD: `f3642cb0b4fdffdd6b9d248d709bb734aef7b566` (dirty: ensure CLI + G10 pins + installer/docs)
- Issue: https://github.com/KaolaBrother/Kaola-Workflow/issues/1016
- Plan of record: comment `5383907624`; Layer 1–2 overridden by `5383958037`
- Frozen overlay: `templates/routing/init.skeleton.md`
- Live evidence: `kaola-workflow/issue-1016/.cache/live-cursor.md`
- Streams: `.cache/probe-control.ndjson`, `.cache/probe-envelopes.ndjson`
- Evidence file: `kaola-workflow/issue-1016/.cache/adversarial.md`

execution: succeeded

## Exact claim

After the worktree changes on `workflow/issue-1016`, a consumer with no project `.cursor/agents` gets a workspace catalog from `$CURSOR_HOME/agents` via `kaola-workflow-ensure-cursor-catalog.js` (and sessionStart hook) without rewriting the consumer CLAUDE.md overlay; `/workflow-next` then named-dispatches omit-model; G10 pins in `scripts/test-cursor-edition.js` cannot stay green if that path is unbound; live CLI streams show control Invalid-enum then new-chat envelopes medium vs high.

## Exact surface

Worktree `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-1016`; evidence under `kaola-workflow/issue-1016/` (`tdd-red.md`, `tdd-green.md`, `implement.md`, `.cache/live-cursor.md`, `.cache/probe-*.ndjson`). Comments 5383907624 (plan) and 5383958037 (freshness amendment) override the issue body. Frozen overlay: `templates/routing/init.skeleton.md`. Cheap mutations and reads only; production not written; copies mutated under `/tmp`.

## Analytical result

`refuted` — execution succeeded. Confidence: high.

Conjunct “G10 pins cannot stay green if that path is unbound” is broken by a concrete GREEN-stays-green weakening on the **isolated** `--global` copy (the file that actually sits alone under `$CURSOR_HOME/kaola-workflow/scripts/`). The other seven attack lines did not yield a current-tree counterexample.

Because the dispatch tied the guard conjunct to the change under consideration, this is not a passing non-refutation.

## Counterexamples attempted and observed

### 1. G10 can be green while production copy path is still unbound (#1014 G9 unused-helper class)

`copyListCanonAgents` is still only defined in `scripts/sync-cursor-edition.js` and called from `scripts/test-cursor-edition.js`. That is leftover G9, not this issue’s production copier. Production copy is `ensureCursorCatalog` in `scripts/kaola-workflow-ensure-cursor-catalog.js`, invoked by the generated sessionStart wrapper (`node "$ENSURE"`) and named on `CURSOR_MODEL_DISPATCH_BLOCK`.

Unbinding **that** copy loop (return `copied` without writing files) would fail `G10-ensure[copied]` (dest must receive the 14 names) and `G10-hook` (dest must have `implementer.md`). The in-tree function is not an unused helper.

The G9 analog that **did** land is the isolated roster vs sibling:

- In-tree `listCanonAgents()` prefers `sync-cursor-edition.js` when that sibling exists (`scripts/kaola-workflow-ensure-cursor-catalog.js` lines 28–39). `G10-ensure` loads `scripts/kaola-workflow-ensure-cursor-catalog.js` **beside** that sibling.
- `G10-cli` isolated `require()` copies the file into a dir with no sibling, then only asserts `typeof ensureCursorCatalog === 'function'`. It never calls the function.
- `G10-hook` copies that same JS to hermetic `$CURSOR_HOME/kaola-workflow/scripts/` (no sibling), drives `TREE_ROOT` `.cursor/hooks/kaola-workflow-ensure-cursor-catalog.sh`, and asserts only dest `implementer.md` plus stdout `{}`.

Driven on `/tmp` copies (production not written):

- Current isolated file: `require()` succeeds; `listCanonAgents()` returns 14 names equal to `sync.listCanonAgents()`; empty dest → `copied` with 14 files; lone dest `implementer.md` → `copied` with all 14 present.
- Mutated isolated `CANON_AGENT_NAMES = ['implementer']`, dest has matching `implementer.md`, global still has 14: status **`already-present`**, dest stays one file. Same mutated file **with** a stub sibling exporting 14 names: status **`copied`**, dest grows to 14. `typeof` pin on the mutated isolated file: `function`. G10-hook replica against `TREE_ROOT` wrapper + mutated isolated JS: stdout `{}`, dest `implementer.md` only — the G10-hook dest pin would stay green.

So G10-ensure (sibling), G10-cli isolated (typeof), and G10-hook (sentinel `implementer.md`) can stay green while the isolated `--global` copy — the consumer production path — treats a lone matching `implementer.md` as `already-present` and copies only that name. That is the unused-helper failure class applied to the **check set**, not to the function’s existence.

Current worktree roster is 14=`sync.listCanonAgents()`; current isolated copy of the unmutated file does copy all 14. The **pins** are what stay green under the mutation. Full `node scripts/test-cursor-edition.js` was not re-run against a mutated worktree file (production not written).

Conjunct 1: `refuted`.

### 2. `already-present` still treats lone `implementer.md` as enough

Current isolated (and in-tree) `ensureCursorCatalog`: dest with only `implementer.md` matching global, global has 14 → status `copied`, dest then has 14 files. `G10-ensure[lone-implementer]` encodes that on the in-tree module.

Only the mutated isolated roster in (1) revives the sentinel. Current candidate does not.

Conjunct 2 (current tree): `not_refuted`.

### 3. Source order still prefers git toplevel over `$CURSOR_HOME/agents`

`ensureCursorCatalog` sets `srcDir = path.join(cursorHome, 'agents')` only. No `git rev-parse`.

Driven:

- Git repo with `# TOPLEVEL` catalog at `<toplevel>/.cursor/agents`, `# HOME` under `$cursorHome/agents`, cwd a nested `consumer/`: dest bytes `# HOME implementer`; toplevel left `# TOPLEVEL`.
- Cwd **is** the git toplevel with drifted dest vs home: dest refreshed to `# HOME implementer`.

Generated `.cursor/commands/workflow-next.md` (worktree) and `CURSOR_MODEL_DISPATCH_BLOCK` have no `in order: git toplevel`. G10-block pin `!/in order:\s*git\s+toplevel/i` matches that absence (absence pin, not a preference pin).

Conjunct 3: `not_refuted`.

### 4. `--global` stale-clean deletes the extra-script (not in `supportScripts('github')`)

`supportScripts('github')` does not include `kaola-workflow-ensure-cursor-catalog.js`.

Hermetic `HOME`/`CURSOR_HOME`, non-git cwd, worktree `install-cursor.sh --yes --global`: extra-script deployed. Planted `stale-old.js`; second `--global` printed `Removed stale script: …/stale-old.js` and **left** the extra-script. `--uninstall --global` removed it. Non-git cwd did not invent `cwd/.cursor`.

Hermetic `$CURSOR_HOME/hooks.json` `sessionStart` after `--global`: compact wrapper then `./hooks/kaola-workflow-ensure-cursor-catalog.sh`. Host `~/.cursor` was not written.

Conjunct 4: `not_refuted`.

### 5. sessionStart ensure clobbers compact-resume `additional_context`

Generated wrapper always prints `{}` after `node "$ENSURE" >/dev/null 2>&1 || true`. G10-hook drives that wrapper **alone**.

Driven both wrappers in sequence (fake `kaola-workflow` package + compact JS printing `RESUME_TEXT_1016`):

- compact stdout: `{"additional_context":"RESUME_TEXT_1016"}`
- ensure stdout: `{}` (`additional_context` key absent)

Field-union merge keeps compact’s `additional_context`. Whole-object last-wins would drop it. Cursor docs: all matching hooks run; on conflict, higher-priority **sources** win; forum logs “Merged N valid response(s)”. Same-array merge is not specified. `{}` does not carry a competing `additional_context` value.

No demonstrated clobber. Residual last-wins uncertainty is not a concrete counterexample.

Conjunct 5: `not_refuted`.

### 6. Overlay was edited or the card still says `in order: git toplevel`

`git diff HEAD -- templates/routing/init.skeleton.md` → 0 bytes. Skeleton has neither `generalPurpose` nor `kaola-workflow-ensure-cursor-catalog`. KW-CLAUDE-TEMPLATE still has the runtime-neutral spawn sentence. Consumer `/tmp/kw-1016-live-LaSoWE/CLAUDE.md` still contains “pass the role's configured model on the spawn call”; no ensure script name.

Worktree generated next card: ensure script, global source of truth, no `in order: git toplevel`.

Conjunct 6: `not_refuted`.

### 7. Live streams do not show the envelope split / a `generalPurpose` retry exists

Independent parse (not trusting `live-cursor.md` prose):

| stream | SHA-256 | events | JSON fail |
|---|---|---|---|
| `probe-control.ndjson` | `8620b27c89d5537b8af17751444fa79ceef1bafa3e387d8508ce06c14291cbc8` | 45 | 0 |
| `probe-envelopes.ndjson` | `89dcca573d78a1397ea9534af45c0bb0da24eda7ac4016a6460869356002b6b4` | 44 | 0 |

Hashes match `live-cursor.md`. Control: one `taskToolCall` completed with `Invalid enum value. Expected 'generalPurpose' | … received 'implementer'`; `gp_task_args=0`, `inherit_model=0`; assistant quoted the error and stopped (no second Task). Envelopes: `implementer` → `cursor-grok-4.6-medium` (child `STANDARD_CHILD_1016_LIVE`); `code-reviewer` → `cursor-grok-4.6-high`; `gp_task_args=0`, `inherit_model=0`. Parent init: Cursor Grok 4.6 Extra High. `generalPurpose` as a substring appears in the Invalid-enum expected list and in the user prompt, not as a Task type.

Consumer leftover: 14 canon files byte-identical to `~/.cursor/agents`; stray `user-agent.md` (`# stray-dest`) survived. Overlay needle still present. Catalog was materialized by worktree CLI (`copied` then `already-present` per live notes), not by host global sessionStart (host `~/.cursor/hooks.json` still compact-only; host extra-script absent — expected until `--global` from this tree). Layer 5 allows script and/or sessionStart.

Conjunct 7: `not_refuted`.

### 8. Isolated `require()` of the ensure JS fails without `sync-cursor-edition.js` beside it

Copied `kaola-workflow-ensure-cursor-catalog.js` alone to `/tmp/kw-1016-adv-56288/iso/`. No sibling. `require()` exported `ensureCursorCatalog` as a function; `listCanonAgents()` returned the 14-name inline roster. Subsequent copy on that isolated module succeeded.

Conjunct 8: `not_refuted`.

## Findings

finding: id=R1 scope=in_scope action=fix status=open severity=medium fix_role=tdd-guide rationale=G10-ensure binds sibling sync.listCanonAgents(); G10-cli isolated require is typeof-only; G10-hook dest pin is implementer.md only — shrinking isolated CANON_AGENT_NAMES to [implementer] keeps those pins green while lone dest implementer.md is already-present.

## Per-conjunct scoreboard

| # | attack | result |
|---|---|---|
| 1 | G10 green while production copy unbound (G9 class) | `refuted` (isolated roster / sentinel hook pin) |
| 2 | already-present on lone implementer.md | `not_refuted` (current tree) |
| 3 | git toplevel preferred over `$CURSOR_HOME/agents` | `not_refuted` |
| 4 | `--global` stale-clean deletes extra-script | `not_refuted` |
| 5 | sessionStart ensure clobbers compact-resume | `not_refuted` |
| 6 | overlay edited or card still `in order: git toplevel` | `not_refuted` |
| 7 | live streams lack envelope split / generalPurpose retry | `not_refuted` |
| 8 | isolated require() fails without sibling | `not_refuted` |

verdict: fail
findings_blocking: 1
