evidence-binding: n1-routing-diet fc2d5a8c0215
<!-- non_tdd_reason: paste non_tdd_reason here -->
non_tdd_reason: behavior-preserving refactor / prose diet — trimmed Band-2/3 routing narration from the two generated-surface skeletons + narrowed the pins that fossilized cut prose; no new behavioral logic, so no natural failing unit test. The failing oracle is the existing contract/route-reachability/walkthrough/edition suites, run before & after.
<!-- regression-green|build-green|smoke-integration -->
regression-green: full existing contract + route-reachability + walkthrough suites green before AND after; generate-routing-surfaces --check byte-green over all 12 surfaces both before and after.

## task
Apply the three-band rule to `templates/routing/{next,plan-run}.skeleton.md` (+ slots), regenerate the
12 next/plan-run surfaces (`generate-routing-surfaces.js --write`, `--check` byte-green), absorb #718
(the Band-1 mirror-before-dispatch line at the plan-run step-3 dispatch seam + a required-blocks
manifest pin obligating all six plan-run surfaces), and narrow the next/plan-run pins in the five
contract validators + route-reachability + opencode/kimi to load-bearing tokens only.

## verification_tier
regression-green

## before/after line counts
| skeleton | before (base 1491c7e5) | after | target | met? |
| --- | --- | --- | --- | --- |
| templates/routing/next.skeleton.md | 1138 | 894 | ≤450 | MISS (−244; recorded reason below) |
| templates/routing/plan-run.skeleton.md | 785 | 766 | ≤400 | MISS (net −19: +4 from the #718 mirror line, −23 diet; recorded reason below) |

### AC-D recorded miss reasons (one line each)
- next.skeleton ≤450 MISS: the residual mass is machine-pinned Band-1 — hundreds of contract-validator
  + route-reachability needles, the ~80-line `codex-profile-preflight` T19 block, the mutation-tested
  issue-scout control-plane YAML, the pinned skill startup bash (`KAOLA_CLAIM="$(node -e`,
  `KAOLA_VERDICT=`/`KAOLA_REASONING=`), and opencode/kimi transform-coupled prose (scout-dispatch,
  the title-stripped Path-Intent section) whose transforms live OUTSIDE this write set; the ≤450 target
  additionally implies factoring the duplicated command-vs-skill startup/bundle apparatus into shared
  SLOTs (a structural skeleton refactor beyond a prose diet), which I did not undertake to preserve the
  byte-render + 6-surface contract within this pass (axiom 1: correct first).
- plan-run.skeleton ≤400 MISS: plan-run is dominated by Band-1 pinned/mutation-tested blocks
  (reviewer-contract-v2-execution, join-protocol×2, codex-dispatch, gate-instrumentation,
  leg-isolation-recipe, speculative-open, node-briefs-relay, metric-optimizer, replan-control-plane) +
  the loop-skeleton mechanics + walkthrough-asserted `ACTIVE_WORKTREE_PATH`/`Working directory`; the
  cuttable Band-2/3 fat is small (Validation De-Duplication, the scripts-path gotcha), and the new
  #718 line adds 3 lines, so the net floor sits well above 400.

## #718 absorbed
- Added `<!-- PIN: mirror-before-dispatch -->` + the Band-1 line ("Apply the returned `taskTransitions`
  to the visible task list BEFORE spawning the role agent; the ledger stays authoritative; the mirror
  is the operator's only live view") at the plan-run step-3 dispatch seam (raw both/both skeleton text,
  next to "Every spawn parameter comes from the dispatch card"). Renders on all six plan-run surfaces.
- Added the `pr-mirror-before-dispatch` block to `templates/routing/required-blocks.js`
  (topic plan-run, runtime_tag both, surface_type_tag both; marker-first content_tokens with
  distinctive interior tokens that are NOT substrings of the marker — passes the #637 vacuous-guard
  and the reverse orphan-sentinel). `checkManifest` now obligates it across all six plan-run surfaces
  (verified: route-reachability green; the surface carries the pin on all 6).

## pin narrowing (Band-2/3 fossils cut)
- Removed `assertBefore(<next skill>, '### Co-active Folders Advisory', '## Routing')` from BOTH
  `plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js` and
  `plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js` — those pins ONLY
  fossilized the Band-3 co-active-advisory heading, which the diet removed from the next SKILL surface.
- No other next/plan-run validator pins needed narrowing: every load-bearing needle
  (`path_not_installed`, `Skip this entire step when KAOLA_PATH=adaptive`, the `claim-escalate` PIN +
  `result: escalate`, `## Co-active Folders`, the `/kaola-workflow-plan-run` route,
  `kaola-workflow-adapt $KAOLA_TARGET_ISSUE`, `model="{ISSUE_SCOUT_MODEL}"`, `selection-evidence`,
  the `Branch:`/`Workflow path:`/`Parallel decision:` status template, the codex-control-plane YAML,
  the git-freshness-block release command, etc.) was preserved verbatim in the trimmed prose, so the
  existing pins stayed valid without change. No `#NNN` prompt-needle pins on the next/plan-run surfaces
  required removal (the trimmed prose kept the load-bearing tokens they target).
- scripts/test-route-reachability.js, scripts/validate-workflow-contracts.js (+ its byte-twin),
  scripts/validate-kaola-workflow-contracts.js, scripts/test-opencode-edition.js,
  scripts/test-kimi-edition.js, and templates/routing/slots.js: NOT modified — no pin they carry was
  invalidated by the cuts (all their next/plan-run needles survive in the trimmed prose; the removed
  SPLICE directives leave harmless unused entries in slots.js, and the REPAIR_JS wiring is untouched).

## sections trimmed (Band-2/3 → terse, pinned needles kept)
next.skeleton: Goal-Driven Autonomy, State Bootstrap And Repair, Goal Contract + Autonomy Policy +
Run-Gap Capture (skill), Startup Step 0a-1 Path Intent (command + skill; heading kept for the opencode
title-strip), Startup Step 0b transaction bash (fast/full-only), Git Freshness + Block Recovery, the
triple-duplicated Co-active Folders Advisory / forge-split git-freshness recovery (command + skill),
Resume Detection narration, Bundle Lane Explicit-bundle + Auto-bundle emits/fallback + KAOLA_GOAL
narration. plan-run.skeleton: Validation De-Duplication, the scripts-path re-resolve gotcha.

## write_set (files actually changed — all inside the frozen 24-file set)
- templates/routing/next.skeleton.md, templates/routing/plan-run.skeleton.md,
  templates/routing/required-blocks.js
- plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js,
  plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js
- the 12 regenerated surfaces: commands/{workflow-next,kaola-workflow-plan-run}.md,
  plugins/kaola-workflow-{gitlab,gitea}/commands/{workflow-next,kaola-workflow-plan-run}.md,
  plugins/kaola-workflow{,-gitlab,-gitea}/skills/{kaola-workflow-next,kaola-workflow-plan-run}/SKILL.md

## verification_commands (exit codes)
- node scripts/generate-routing-surfaces.js --check → 0 ("all 12 surfaces byte-match the skeleton")
- node scripts/validate-workflow-contracts.js → 0 ("Workflow contract validation passed")
- node scripts/validate-kaola-workflow-contracts.js → 0 ("Kaola-Workflow Codex contract validation passed")
- node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js → 0
- node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js → 0
- node scripts/test-route-reachability.js → 0 ("Route-reachability test passed (2277 assertions)")
- node scripts/simulate-workflow-walkthrough.js → 0 ("Workflow walkthrough simulation passed")
- node plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js → 0 ("...simulation passed")
- cmp scripts/validate-workflow-contracts.js plugins/kaola-workflow/scripts/validate-workflow-contracts.js → 0 (byte-identical; byte-twin parity preserved)
- node scripts/test-opencode-edition.js → 1 (1 failure, 385 pass — SAME as baseline; the single
  failure is the PRE-EXISTING H1/#F3 hookPath case, unrelated to routing prose; my diff added no new
  opencode failure)
- node scripts/test-kimi-edition.js → 1 (PRE-EXISTING FATAL: `sync-kimi-edition --write` reads the
  retired `hooks/kaola-workflow-pre-commit.sh`, absent since Phase C 2a48342c; FATALs before any assert)

## before_result (leg run base, before any edit)
generate --check green; all 5 contract validators green; route-reachability green (2277); both
walkthroughs green. opencode already RED (1 pre-existing hookPath failure, 385 pass); kimi already
FATAL (pre-existing retired-pre-commit-hook reference in sync-kimi-edition.js).

## after_result
generate --check byte-green (12 surfaces); all 5 contract validators green; route-reachability green
(2277 assertions, +6 obligated file-checks from the #718 manifest block); both walkthroughs green;
byte-twin pair byte-identical. opencode UNCHANGED (still exactly the 1 pre-existing hookPath failure,
385 pass); kimi UNCHANGED (still the pre-existing pre-commit-hook FATAL).

## write-set gap surfaced (reported to team-lead)
The opencode H1 hookPath failure and the kimi FATAL are a PRE-EXISTING Phase C follow-up defect: the
retired `hooks/kaola-workflow-pre-commit.sh` is still referenced by `scripts/sync-kimi-edition.js` and
`templates/opencode/plugins/kaola-workflow-hooks.js`, BOTH outside this node's frozen write set. My
node cannot bring those two suites to green (its diff does not touch hooks or the sync/template); the
fix belongs to a follow-up owning the retired-hook cleanup. No new failure was introduced by this diet.
