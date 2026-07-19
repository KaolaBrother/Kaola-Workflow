evidence-binding: n6-routing 662f27013d5a
non_tdd_reason: generated prose + reachability-assertion retirement — excising retired fast/full
routing prose from a skeleton template that is machine-regenerated into 12 surfaces (only 6 of
which change), plus updating a hand-rolled assertion-based reachability suite to match; there is
no natural failing unit test for "delete stale route arms and stale surface-list expectations,"
so the meaningful proof is the existing scoped verification chain (skeleton-vs-surface byte
regeneration + the full reachability/manifest assertion suite) re-run green after the retirement.
regression-green: the three scoped commands are all green after the retirement —
`node scripts/generate-routing-surfaces.js --check` (12/12 surfaces byte-match the skeleton),
`node scripts/test-route-reachability.js` (2277 assertions, 0 failures), and
`node scripts/test-generate-routing-surfaces.js` (280 assertions) — proving the regenerated next
surfaces carry no dangling fast/full routing prose and the reachability suite's manifest/T-block
assertions hold against the retired + regenerated tree.

upstream_read: n1-recon 30aed1d97859
upstream_read: n5-install 214fb0a3e271

## verification_tier

regression-green

## task

n6-routing: excise the fast/full routing prose from `templates/routing/next.skeleton.md` (route
table entries, the KAOLA_PATH=fast/full path-intent escape logic, dangling refs to deleted
`/kaola-workflow-fast` / `/kaola-workflow-phaseN` commands), regenerate the 6 `next` surfaces via
`generate-routing-surfaces.js --write` (plan-run surfaces MUST stay byte-identical), hand-edit the
3 `kaola-workflow-finalize.md` command copies to remove the full-advance plan-absent wiring (now
`adaptive_plan_missing` per n4) and the `workflow_path: fast` / `full (or absent)` read branches,
and update `test-route-reachability.js` to drop the fast/full route tables and surface-list
expectations so it matches the regenerated surfaces — without re-pinning the stale, unowned Codex
finalize SKILL packs (n1-recon GAP-1) or touching `templates/routing/slots.js` (trap 5).

## write_set (11/11, exact match to the n6-routing declared_write_set row)

- templates/routing/next.skeleton.md                                          (MODIFIED — skeleton source)
- commands/workflow-next.md                                                   (REGENERATED via --write)
- plugins/kaola-workflow-gitlab/commands/workflow-next.md                     (REGENERATED via --write)
- plugins/kaola-workflow-gitea/commands/workflow-next.md                      (REGENERATED via --write)
- plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md                  (REGENERATED via --write)
- plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md           (REGENERATED via --write)
- plugins/kaola-workflow-gitea/skills/kaola-workflow-next/SKILL.md            (REGENERATED via --write)
- commands/kaola-workflow-finalize.md                                         (MODIFIED, hand-edit)
- plugins/kaola-workflow-gitlab/commands/kaola-workflow-finalize.md           (MODIFIED, hand-edit, modulo forge nouns)
- plugins/kaola-workflow-gitea/commands/kaola-workflow-finalize.md            (MODIFIED, hand-edit, modulo forge nouns)
- scripts/test-route-reachability.js                                         (MODIFIED)

Nothing outside this set was touched by this leg — `git status --porcelain` shows exactly these 11
paths as ` M`, plus the pre-existing upstream `D`/`M` changes from n2–n5 and the untracked
`kaola-workflow/issue-725/` project dir. The `templates/routing/plan-run.skeleton.md`-derived 6
plan-run surfaces (`commands/kaola-workflow-plan-run.md` ×3 + `kaola-workflow-plan-run/SKILL.md`
×3) do NOT appear in `git status` after `--write` — confirmed byte-identical (per-brief STOP
condition never triggered). `templates/routing/slots.js` was read but never edited (trap 5: its
REPAIR_JS repair-state wiring carries no fast/full content, confirmed by n1).

## per-file change summary

### templates/routing/next.skeleton.md (skeleton source; both `REGION:command` and `REGION:skill`
edited in parallel, since the file carries a command-flavored copy and a skill-flavored copy of
the same router prose)

- **Step 0a-1 "Path Intent"** (command ~L310, skill ~L854): replaced the 3-branch KAOLA_PATH
  selection logic (explicit `KAOLA_PATH` honor / "fast path"|"full path"|"full review"|"all
  phases" keyword escapes / default-to-adaptive) with unconditional "adaptive is the only
  installable workflow path — `export KAOLA_PATH=adaptive` and proceed" prose. Kept a defensive
  paragraph: if `KAOLA_PATH` is somehow already exported to a non-adaptive value (residual env
  state, a direct script invocation), honor it verbatim and let the claim's typed
  `path_not_installed` refusal be the authority — never silently fall back to adaptive. This
  preserves the `path_not_installed` literal (still a live claim.js refusal per n4, pinned by
  `test-route-reachability.js`'s SUPERSET-PROOF on the 3 next COMMAND surfaces) while removing the
  natural-language "fast path"/"full path" escape vocabulary entirely. "State the chosen path"
  printed block reduced from 3 lines (adaptive/fast/full) to 1 (`Path: adaptive (default)`).
- **Dangling `kaola-workflow-fast.md` refs** (skill region, was L910/L916 per n1's anchor):
  removed the two `REGION:gitlab`/`REGION:gitea` "Bias toward full when in doubt. Fast false
  positives escalate cleanly via the Fast Eligibility and Mid-Flight Escalation sections of
  `.../kaola-workflow-fast.md`" paragraphs — pure dangling references into an n2-deleted file, no
  command-region counterpart existed.
- **Stale "startup records `workflow_path: fast`" line** (command region, was L421): rewritten —
  since `claimProject`'s #538 gate reads `process.env.KAOLA_PATH` directly and now refuses ANY
  non-adaptive value with `path_not_installed` (n3/n4), the old claim ("startup records
  workflow_path: fast") was factually false post-retirement; replaced with "a non-adaptive
  KAOLA_PATH ... is never silently recorded — startup refuses it with the typed
  path_not_installed refusal."
- **Route tables** (command "Resume Detection" ~was L549-575; skill "Manual reconstruction order"
  ~was L1108-1119): collapsed the 10/12-line phaseN+fast ladder down to the 2 real surviving
  states (`finalization-summary.md exists` / `workflow-plan.md exists -> .../kaola-workflow-plan-
  run`) plus one fallback line routing to `/kaola-workflow-adapt` (command) /
  `kaola-workflow-adapt` (skill) for the no-state case. Trimmed the now-meaningless "ahead of the
  phaseN ladder" / "never a phaseN fallback" qualifiers on the surviving `workflow-plan.md` line to
  "toggle-agnostic ... never a silent fallback" (T4 substring `workflow-plan.md exists ->
  kaola-workflow-plan-run` preserved verbatim).
- **Dangling command refs outside the tables**: "New work starts with: `/kaola-workflow-phase1
  <task description or issue>`" (Select Project, command region) -> `/kaola-workflow-adapt <task
  description or issue>`; Resume Detection's state-file validation bullet "`next_command` is one
  of the six phase commands" -> "`next_command` is `/kaola-workflow-plan-run` (the adaptive
  route)" (the scaffold now writes a single fixed adaptive route per n4, so "one of six" was
  stale).
- **Required Output placeholder** (both regions, 2 occurrences): "Workflow path: {adaptive by
  default; fast|full only on an explicit path-name keyword or KAOLA_PATH — from KAOLA_PATH or Step
  0a-1 judgment}" -> "Workflow path: {adaptive — the only workflow path; a non-adaptive KAOLA_PATH
  is refused by the claim's path_not_installed}" (the old placeholder described a keyword-escape
  mechanism this leg just removed).
- **Untouched by design**: Step 0a-2's "Non-adaptive paths (`fast`|`full`) fall through to Step 0b
  unchanged" sentence, Step 0b/"Startup Transaction"'s own "runs for the `fast` and `full` paths
  only" framing, the bundle-lane's "`KAOLA_PATH=fast`/`full` is refused with
  `bundle_requires_adaptive`" mentions, and the generic "phase artifacts / `fast-summary.md`"
  resume-discovery heuristics (Router Rules / Select Project / State Bootstrap) — none reference a
  deleted command/file, all remain accurate defensive/legacy-tolerant prose, and Step 0b/Startup
  Transaction physically carries load-bearing PINned content (`<!-- PIN: claim-escalate -->` +
  `result: escalate`, required by T7 on all 6 `next` surfaces; the Codex-only "Codex Dispatch Mode
  Detection" block, required by T13) that a wholesale removal would have broken without expanding
  this leg's write set. TRAP 1 honored — no grep-and-delete of "full": "full main-session
  conversation", "the full issue set", "Full-history forked agents", `--symbolic-full-name`,
  "fast-forward"/"attempt fast-forward" all preserved verbatim.
- Regenerated via `node scripts/generate-routing-surfaces.js --write`: rendered 12 surfaces: only
  the 6 `next` surfaces changed (confirmed via `git status`); the 6 `plan-run` surfaces are
  byte-identical (never appeared in `git status`) — the brief's STOP condition never triggered.

### commands/kaola-workflow-finalize.md + gitlab/gitea copies (hand-edit, modulo forge nouns:
`kaola-gitlab-/kaola-gitea-workflow-full-advance.js` script name, "GitHub"/"GitLab"/"Gitea" issue
noun, `issue_number`/`issue_iid` field name)

- **`## Prerequisite`**: removed the `workflow_path: fast` branch (the `fast-summary.md` PASSED
  check + "Fast-path summary is not complete" refusal) entirely. Removed the outer `If
  workflow_path: adaptive:` conditional wrapper — its body (the 4-gate `--resume-check`/
  `--gate-verify`/`--barrier-check`/`--verdict-check` script-enforced barrier) is now unconditional
  prose under "Adaptive is the only workflow path (`workflow_path: adaptive` in
  `kaola-workflow/{project}/workflow-state.md`):". Removed the `If workflow_path: full (or
  absent):` branch (the `kaola_script kaola-*-workflow-full-advance.js phase5-verify` shell-out) —
  replaced with a description of the ACTUAL current cmdFinalize behavior (verified against
  `scripts/kaola-workflow-claim.js:2857-2874`, n4's landed change): if `workflow-plan.md` is
  absent, `cmdFinalize` refuses unconditionally, before any archive/close side effect, with the
  typed `finalize_gate_unverified` / `adaptive_plan_missing` refusal — "there is no retired
  fast/full verifier to shell and no N/A pass."
- **"Read:" artifact list** (Goal Attestation section): collapsed the `workflow_path: fast ->
  fast-summary.md` / `workflow_path: full (or absent) -> phase1-research.md, phase3-plan.md,
  phase4-progress.md, phase5-review.md` conditional reads into one unconditional list:
  `workflow-state.md` + `workflow-plan.md` (the adaptive artifact).
- **Documentation Docking bullet**: removed "on the fast path (`workflow_path: fast`), substitute
  `fast-summary.md` ... for the Phase 1/3/4/5 bullets above" (the surrounding Phase 1/3/4/5 bullets
  themselves were left untouched — not a `workflow_path:` branch, out of this leg's declared
  scope).
- **Step 2 - Acceptance Check**: removed the "On the fast path (`workflow_path: fast`), the Phase
  1/3 artifacts do not exist — source the acceptance evidence from `fast-summary.md` instead ..."
  paragraph.
- **`<!-- PIN: fast-compliance-backstop -->` block — RESTORED after an initial full removal.**
  Discovered mid-leg: `templates/routing/required-blocks.js` (NOT in this node's write set) has a
  `fn-fast-compliance-backstop` manifest entry (`topic: 'finalize', runtime_tag: 'both',
  surface_type_tag: 'both'`) that unconditionally obligates ALL 6 finalize surfaces — including the
  3 COMMAND copies this node owns — to carry the literal `<!-- PIN: fast-compliance-backstop -->`
  marker and the `fast_compliance_unresolved` token, verified via `node
  scripts/test-route-reachability.js`'s MANIFEST presence check (`missing-token` failures on all 3
  commands after the first removal pass). Since `required-blocks.js` is outside the declared write
  set and cannot be touched, the PIN is RESTORED — reframed as an honest "legacy backstop (dormant
  post-retirement)" paragraph (the retired `fast_compliance_unresolved` script refusal used to fire
  inside the now-deleted fast-advance/fast-audit scripts; adaptive's own `--verdict-check` barrier
  is the sole live compliance gate) rather than describing the fast path as if still selectable.
  This is a genuine, discovered, UNOWNED write-set gap — same shape as n1-recon's GAP-1 — recorded
  here for the code-reviewer/finalize node: `templates/routing/required-blocks.js`'s
  `fn-fast-compliance-backstop` block should be retired in a follow-up leg once its owner is
  assigned (Phase B/C/D or an explicit backlog item), at which point this restored paragraph
  becomes deletable too.
- **Issue-link line** (`## Step 7`): "If the project links a GitHub/GitLab/Gitea issue (from
  `phase1-research.md` on the full path, or `issue_number`/`issue_iid` in `workflow-state.md` on
  the fast path):" -> "If the project links a {forge} issue (`issue_number`/`issue_iid` in
  `workflow-state.md`):" — verified `issue_number`/`issue_iid` is written unconditionally by
  `writeState()` (`scripts/kaola-workflow-claim.js:834`, `data.issue_number || ''`), not a
  fast-path-only field; `phase1-research.md` never exists in the adaptive-only world.
- TRAP 1 honored across all 3 copies — "full stop", "full suite", "full enum", "full relevant",
  "full gated runner", "full procedure", "fast-forward merges"/"non-fast-forward", "keeps full
  `--verdict-check` coverage" all preserved verbatim (spot-checked via `grep -n "\bfast\b\|\bfull\b"`
  post-edit on all 3 files — every remaining hit is Trap-1 vocabulary or the restored legacy
  backstop paragraph).

### scripts/test-route-reachability.js

- **Header comment + `emittedSkillTargets`/`emittedCommandTargets`** (T1/T2 receipt-emission
  model): dropped the `fast -> kaola-workflow-fast` / `full -> kaola-workflow-research`/
  `/kaola-workflow-phase1` comment lines and array entries — claim.js never emits a non-adaptive
  route target post-retirement (n4 confirmed the scaffold always writes the adaptive route; no
  `isFast` branch survives).
- **T3** (dead-zone RED-proof): updated the "fast/research still resolve" assertion (which assumed
  a longer emitted-target array) to `unreachable.length === emittedSkillTargets.length` — with only
  2 emitted targets now, dropping both from the simulated dead zone still proves the resolver bites
  on 100% of the (now-smaller) emitted set.
- **T10 ("fast-compliance-backstop pin, 12 surfaces") and T11 ("adaptive-default-contract pin, 12
  surfaces") — DELETED IN FULL.** Both blocks' DEDICATED fast/full-entry surface lists
  (`commands/kaola-workflow-fast.md`, `commands/kaola-workflow-phase1.md`, and their 3-edition
  Codex SKILL/command mirrors) are 100% n2-deleted files; `fs.readFileSync` on any of them throws.
  Replaced with a single explanatory comment block recording that the fast-compliance-backstop PIN
  itself SURVIVES on the 6 finalize surfaces only (see the restored PIN above + the MANIFEST/
  SUPERSET-PROOF entries), obligated by the out-of-scope `required-blocks.js` entry — not deleted,
  just no longer duplicated as a dedicated fast/full-surface T-block.
- **T18 ("optional full-path review/fix loop", ~450 lines) — DELETED IN FULL.** Its surface arrays
  (`commands/kaola-workflow-phase5.md` ×3, `plugins/*/skills/kaola-workflow-review/SKILL.md` ×3)
  are both 100% n2-deleted; every sub-check inside (reviewer-dispatch receipt alignment, mechanical
  Phase-5 tokens, evidence-binding tokens, the full-advance generic-find negative, the full-advance
  script-name map + live fresh-shell transaction spawnSync test) is unreachable without those
  files. Replaced with an explanatory retirement comment; adaptive review evidence stays covered by
  T17's reviewer-contract-v2 blocks on the plan-run/adapt/finalize surfaces.
- **T19** (Codex profile-preflight dispatch-skill universe): `expectedDispatchSkills` shrunk from
  10 entries to the 4 surviving dispatch-capable skills (`kaola-workflow-adapt`,
  `kaola-workflow-finalize`, `kaola-workflow-next`, `kaola-workflow-plan-run`) — dropped
  `kaola-workflow-{execute,fast,ideation,plan,research,review}` (all n2-deleted SKILL.md files;
  T19's own `fs.readdirSync` + dispatch-signal filter now naturally excludes them since the dirs no
  longer exist, so the hardcoded expectation had to shrink to match or T19's exact-set assertion
  would fail).
- **SUPERSET-PROOF `LEGACY_PAIRS`**: `fast_compliance_unresolved` entry (surfaces: FN6, all 6
  finalize surfaces) round-tripped — removed when the PIN paragraph was first deleted from the 3
  finalize commands, RESTORED alongside the PIN's restoration (see above) since the token is once
  again present on all 6 finalize surfaces. `path_not_installed` and `Skip this entire step when
  \`KAOLA_PATH=adaptive\`` (both scoped to `nxCmd`, the 3 next COMMAND surfaces) were deliberately
  PRESERVED in the skeleton edit (not touched in this file) — both literal strings verified still
  present post-edit via `grep -c` on the skeleton before regenerating.
- Everything else in the file (T4–T9, T12–T17, T19's preflight-block content, the #630 Layer-1
  REQUIRED_BLOCKS manifest driver, the SUPERSET-PROOF's other ~40 LEGACY_PAIRS entries, the
  RED-PROOF battery) is untouched — none of it referenced fast/full vocabulary or a deleted
  surface.

## Discovered scope note (for n11-code-certify / finalize)

`templates/routing/required-blocks.js`'s `fn-fast-compliance-backstop` block (topic: `finalize`,
both/both) is a write-set gap this node discovered but cannot close (the file is not in n6's
declared write set). It force-keeps the `fast-compliance-backstop` PIN + `fast_compliance_unresolved`
literal alive as dormant legacy prose on all 6 finalize surfaces (the 3 commands this node
restored + the 3 already-carrying Codex skill packs). This does not block Phase A (the reachability
suite is green, the token references no deleted file/script), but is recorded here so a later
node/phase can retire the `required-blocks.js` entry and drop the restored paragraph together.

## verification_commands + outputs

1. `node scripts/generate-routing-surfaces.js --check` (pre-write, confirms drift is exactly the
   skeleton edit) -> reported DRIFT only on the 6 `next` surfaces, matching the skeleton diff.
2. `node scripts/generate-routing-surfaces.js --write` -> "rendered 12 surfaces."
3. `git status --porcelain` post-write -> exactly the 6 `next` surfaces newly modified; the 6
   `plan-run` surfaces absent from the diff (byte-identical, confirmed).
4. `node scripts/generate-routing-surfaces.js --check` (post-write) -> exit 0, "all 12 surfaces
   byte-match the skeleton."
5. `node scripts/test-route-reachability.js` -> exit 0, "Route-reachability test passed (2277
   assertions)." (first run after the initial fast-compliance-backstop removal was RED with 7
   failures — all `MANIFEST missing-token` on the 3 finalize commands; fixed by restoring the PIN,
   see above; re-run green.)
6. `node scripts/test-generate-routing-surfaces.js` -> exit 0, "all 280 assertions passed."
7. `node -c scripts/test-route-reachability.js` -> exit 0 (syntax check after the ~550-line T18/
   T10/T11 deletion).
8. Scope: `git status --porcelain` shows exactly the 11 n6 write-set files as ` M`; the 6 plan-run
   surfaces, `templates/routing/slots.js`, `templates/routing/required-blocks.js`, and the 3 Codex
   finalize SKILL packs are UNTOUCHED. No file outside the n6+upstream (n2 `D` / n3-n5 `M`) sets was
   modified.
9. Trap sweep: `grep -n "\bfast\b\|\bfull\b\|phase[1-9]" templates/routing/next.skeleton.md` and the
   3 finalize commands post-edit — every remaining hit is Trap-1 vocabulary (`escalated_to_full`
   n/a in this file; "full main-session conversation", "full issue set", "Full-history forked
   agents", `--symbolic-full-name`, "fast-forward"/"attempt fast-forward"), the still-live
   `path_not_installed`/bundle_requires_adaptive defensive-refusal descriptions, the generic
   `fast-summary.md`/`phase*.md` resume-discovery heuristics (Category-B-style, harmless), or the
   restored legacy fast-compliance-backstop paragraph (documented gap above) — no dangling
   reference to a deleted command/file remains.

## before_result

Serial-chain reality: at this leg's start, `next.skeleton.md` still generated 12 surfaces including
fast/full routing prose and dangling `/kaola-workflow-fast`/`/kaola-workflow-phaseN` references; the
3 finalize commands still shelled the (n2-deleted) `kaola-*-workflow-full-advance.js` on a
plan-absent/full/absent workflow_path; `test-route-reachability.js`'s T10/T11/T18 blocks and the
`fastComplianceBackstopSurfaces`/`adaptiveDefaultContractSurfaces`/`claudeReviewSurfaces`/
`codexReviewSurfaces` arrays pointed at files n2 had already deleted, so
`node scripts/test-route-reachability.js` was RED entering this leg (uncaught `ENOENT` on the first
`fs.readFileSync` of a deleted fast/phase surface) — the expected upstream-broken transient this
leg converges. `generate-routing-surfaces.js --check` was clean (no skeleton edits yet).

## after_result

All three scoped commands green: `generate-routing-surfaces.js --check` (12/12 byte-match),
`test-route-reachability.js` (2277 assertions, 0 failures), `test-generate-routing-surfaces.js` (280
assertions). Only the 6 `next` surfaces regenerated; the 6 `plan-run` surfaces stayed byte-identical
(brief's STOP condition never triggered). The 3 finalize commands no longer shell the retired
full-advance script or branch on `workflow_path: fast`/`full (or absent)`; they describe the actual
`adaptive_plan_missing` refusal landed by n4. `templates/routing/slots.js` untouched (trap 5). A
genuine unowned write-set gap (`required-blocks.js`'s `fn-fast-compliance-backstop` block) was
discovered, could not be closed in this leg, and is recorded above for a later phase. Per the brief,
the full four-edition chains / walkthrough are NOT run in this leg (n7–n9 haven't converged the
opencode/kimi suites, walkthroughs, or validators yet — e.g. `scripts/test-opencode-edition.js`
still references the n2-deleted fast/phase surfaces until n7 lands); cross-file convergence and the
four-chain-green verdict land downstream and at finalize. No commit made.
