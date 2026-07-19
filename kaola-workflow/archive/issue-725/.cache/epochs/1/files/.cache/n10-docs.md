evidence-binding: n10-docs efb129378ce0
findings: retired fast/full path prose across all 9 declared doc files + authored superseding ADR D-725-01.md (supersedes D-538-01, D-543-01); every behavioral claim verified against the actual landed code (claim.js refusal envelope, install.sh flag removal, adaptive-schema WORKFLOW_PATHS, repair-state.js reconstruct(), n7's opencode/kimi assertion counts) before being written; the two known-unowned residual gaps (Codex finalize/init SKILL packs, install-opencode.sh/install-kimi.sh flags) are documented as OPEN, never as fixed.
docs_updated: README.md, docs/api.md, docs/workflow-state-contract.md, docs/architecture.md, docs/conventions.md, docs/opencode-edition.md, docs/kimi-edition.md, CLAUDE.md, CHANGELOG.md, docs/decisions/D-725-01.md (new)

upstream_read: n1-recon 30aed1d97859
upstream_read: n9-validators ad8d90f7dd37

## task

n10-docs: retire fast/full-path documentation across README.md, docs/api.md,
docs/workflow-state-contract.md, docs/architecture.md, docs/conventions.md,
docs/opencode-edition.md, docs/kimi-edition.md, CLAUDE.md, CHANGELOG.md, and author the
superseding ADR docs/decisions/D-725-01.md. Anti-fabrication discipline: every behavioral
claim diffed against the real script/flag/refusal in the worktree before being written; no
claim guessed.

Also skimmed n3-core-scripts.md, n4-claim.md, n5-install.md, n6-routing.md,
n7-opencode-kimi.md, n8-walkthroughs.md for what actually shipped (not required upstream_read
per the plan's binding constraints, but read for accuracy before writing prose).

## write_set (exactly the 10 files in the n10-docs plan row)

- README.md                              (MODIFIED)
- docs/api.md                            (MODIFIED)
- docs/workflow-state-contract.md        (MODIFIED)
- docs/architecture.md                   (MODIFIED)
- docs/conventions.md                    (MODIFIED)
- docs/opencode-edition.md               (MODIFIED)
- docs/kimi-edition.md                   (MODIFIED)
- CLAUDE.md                              (MODIFIED)
- CHANGELOG.md                           (MODIFIED — one new [Unreleased] ### Removed entry;
                                           no existing entry touched)
- docs/decisions/D-725-01.md             (NEW)

`git status --porcelain` confirms exactly these 10 paths (9 ` M` + 1 `??`) as this node's
writes beyond the pre-existing upstream (n2 `D` / n3-n9 `M`) set; `docs/decisions/D-538-01.md`
and `docs/decisions/D-543-01.md` show ZERO diff (`git status --porcelain` on both = empty
output) — confirmed immutable, referenced only, never edited. Did NOT commit.

## verification facts I confirmed in the worktree before writing (anti-fabrication)

- `scripts/kaola-workflow-claim.js:2857-2874` — the exact `cmdFinalize` plan-absent refusal
  envelope: `{result:'refuse', reason:'finalize_gate_unverified', gate:'workflow_path',
  inner_reason:'adaptive_plan_missing', workflow_path:<stale value>,
  operator_hint:'Restore the frozen workflow-plan.md before Finalization. No archive or
  closure side effect was made.', errors:['adaptive_plan_missing']}` — quoted verbatim in
  docs/api.md and D-725-01.md.
- `install.sh` — grepped for `WITH_FAST`/`WITH_FULL`/`installed_paths`/`enable-adaptive` —
  zero live occurrences; `--enable-adaptive` still warn-and-ignores; `--with-fast` falls
  through to "Unknown argument" (exit 2); config-write strips `installed_paths` via
  `config.pop("installed_paths", None)`.
- `docs/decisions/D-538-01.md` / `D-543-01.md` read in full to identify the exact opt-in-axis
  mechanics being superseded and to name them precisely in D-725-01's Supersedes section.
  Also checked `0004-script-owned-mechanical-transitions.md`, `D-571-01.md`, `D-572-01.md` —
  none of these are opt-in-axis records (0004 is about the fast/full-era execution-ownership
  design generally, D-572-01 is about the workflow-init template, out of scope) — only
  D-538-01 and D-543-01 matched "the with-fast/with-full/installed_paths opt-in axis" per the
  binding constraint's own framing; neither was edited.
- `plugins/{kaola-workflow,kaola-workflow-gitlab,kaola-workflow-gitea}/skills/kaola-workflow-finalize/SKILL.md`
  grepped for `full-advance` — CONFIRMED still present (`KAOLA_FULL_ADVANCE_NAME=...`) — this
  is n1's GAP-1, NOT remediated by any node this run. Documented as an open residual in
  CHANGELOG + D-725-01, never claimed fixed.
- `commands/commands/*.md` count — verified `ls commands/*.md` = exactly 5 (was 11
  pre-retirement); used to correct the stale "11 commands"/"11 command skills" counts in
  docs/opencode-edition.md and docs/kimi-edition.md.
- Ran `node scripts/test-opencode-edition.js` (396 assertions) and
  `node scripts/test-kimi-edition.js` (440 assertions) myself to confirm the exact current
  counts before writing them into the two edition docs (matches n7's evidence, independently
  re-verified rather than trusted blind).
- `scripts/kaola-workflow-repair-state.js` `reconstruct()` read in full — confirmed it now
  routes ONLY through `routeAdaptive` or returns `{reason:'no adaptive plan available for
  repair'}` — no phase-artifact/fast-summary fallback survives — used to correct README's
  repair-state.js table row and the "Resuming"/"State bootstrap and repair" sections.
- `scripts/kaola-workflow-classifier.js` grepped — confirmed it STILL tolerantly reads
  `phase3-plan.md`/`phase1-research.md`/`fast-summary.md` for legacy claimed projects (Trap 2 /
  Decision 2, untouched by design) — used to keep (not delete) the classifier-config paragraph
  in README, reworded to mark it explicitly as legacy/tolerant rather than an ongoing feature.

## skip_reason notes (claims I declined to write because I could not verify them safely)

- skip_reason: did NOT touch `docs/opencode-edition.md`/`docs/kimi-edition.md`'s
  `--with-fast`/`--with-full` FLAG-PARSING description in `install-opencode.sh`/
  `install-kimi.sh` themselves (still accepted, still recorded into `installed_paths`) — per
  the binding constraint these two installers are an explicit known-unowned gap this run; I
  only corrected the objectively-verifiable canonical-source-side facts (command counts,
  "the generator now emits only 5") and left the installer's own flag-acceptance behavior
  exactly as documented, adding a factual (not normative) note that the flags currently have
  no matching source to deploy.
- skip_reason: did not edit `.env.example` (out of write set per binding constraint) even
  though it still documents `install.sh --with-fast`/`--with-full` — left for a follow-up
  phase.
- skip_reason: did not touch `commands/workflow-init.md` / `kaola-workflow-init/SKILL.md` (×3
  editions) — GAP-2 from n1-recon, unowned by any node this run, out of my declared write set.
- skip_reason: left the "Adaptive audit coverage"/`installed_paths:[]` seed comments inside
  test files alone (not in my write set; those are n3/n4/n7/n8/n9's domain).

## CLAUDE.md line count

142 lines after edit (`wc -l CLAUDE.md`), well under the 200-line ceiling. Edits: Project
Overview sentence reworded (adaptive is the only path, fast/full retired, points at
D-725-01); Durable State Contract bullet dropped the "fast path's optional fast-summary.md"
clause; "### Adaptive Is the Default; Don't Make the Agent Pick a Path" renamed to
"### Adaptive Is the Only Path" and its four bullets collapsed to three (no more "opt-in"
bullet or "switch axis flips" bullet — nothing left to flip). Key Scripts section already
listed no retired scripts (verified by direct read before editing) — nothing to remove there.

## D-725-01.md — Supersedes

Supersedes docs/decisions/D-538-01.md (the original switch-axis flip: adaptive unconditional
default, fast/full become install-time opt-ins) and docs/decisions/D-543-01.md (the
--with-fast/--with-full opt-in partition ported to Codex + the folded opencode path-leak
fix). Both superseded files are UNTOUCHED (immutable per convention; status line update is
NOT something I did — the existing repo convention, confirmed by reading D-538-01's own
"Superseded by D-538-01" line on 0007, is that the superseding ADR states the relationship;
the superseded file's own Status line is left as "Accepted" in this run since editing the
superseded file's Status line would violate "never edit the superseded records" — I did not
touch either file. If a Status-line update convention is desired, it belongs to whoever owns
those two files, not this read-only-toward-them node).

## per-file change summary

- **README.md**: intro sentence + feature bullet drop fast/full; ASCII path diagram collapsed
  to adaptive-only with a one-line retirement note; stale "/goal finish phase 4" example
  replaced with an adaptive-appropriate example; "Path selection is identical across all four
  editions" paragraph reworded (Claude/Codex/GitLab/Gitea are now the ONLY-adaptive editions;
  opencode/Kimi Code deferred to their own docs); Claude Code install section's
  `--with-fast`/`--with-full` block removed (now unknown-flag errors); "Other paths: fast and
  full (optional)" section (~30 lines incl. the fast/full mechanics table) replaced with a
  short retirement pointer; automation-scripts table: claim.js row reworded ("every claim" not
  "full, fast, adaptive"), repair-state.js row rewritten to the real `reconstruct()` behavior,
  `kaola-workflow-fast-audit.js` + `test-fast-audit.js` rows DELETED (scripts deleted by n2);
  durable-state paragraph + `KAOLA_PATH` env-var row reworded; two worktree-section
  "(full, fast, and adaptive paths)" mentions and one "Phase 4 TDD runs" mention fixed; the
  retired full-path Phase-5 review-boundary paragraph (~20 lines under "Trust the hooks")
  replaced with a pointer to the live adaptive reviewer contract; "Resuming" +
  "State bootstrap and repair" sections reworded off phase-file/fast-summary vocabulary;
  classifier-config paragraph reworded to mark the fast-summary.md read as legacy-only.
  Intentionally LEFT UNTOUCHED: the opencode/kimi installer `--with-fast`/`--with-full`
  usage blocks (406-433-ish) — per binding constraint, those two installers are an unowned
  known gap this run.
- **docs/api.md**: global-config JSON example dropped `installed_paths`; its bullet rewritten
  to "Retired (#725)" + tolerate-on-read note; `KAOLA_WORKTREE_NATIVE` bullet reworded;
  "## Fast / Full Transaction Scripts" section (~62 lines, incl. the huge Phase-5 prerequisite
  block) replaced with a short retirement note PLUS a newly-added, code-verified documentation
  of the `adaptive_plan_missing` refusal envelope (the task's explicit ask); "## Contractor
  Agent" section pruned of dead fast/full-advance script references while keeping the
  Finalization-only framing and ADR 0004 exception; two stray references (`install-codex-
  agent-profiles.js --global` composing with `--with-fast`/`--with-full`; a worktree-
  provisioning comment) fixed.
- **docs/workflow-state-contract.md**: Durable Sources bullets rewritten (phase artifacts /
  fast-summary.md demoted from "durable evidence" to "legacy, tolerant-read-only"); the
  `workflow_path` field description rewritten (WORKFLOW_PATHS=['adaptive'] is now the sole
  legal value); the entire "Adaptive Path — installed_paths Config Field" section rewritten to
  "the only workflow path" framing describing the retirement, not the opt-in; "Script-Owned
  Mechanical Transitions" table dropped the Fast/Full-Phase-1-2-3-5/Full-Phase-4 rows (kept
  Adaptive per-node + Finalization) and its trailing prose about phase-file compliance
  authoring was replaced with a one-line retirement note.
- **docs/architecture.md**: "## Workflow Paths (fast / full / adaptive)" header + its 3-way
  bullet list collapsed to "## Workflow Path (adaptive — the only path)"; the
  "ahead of the phaseN ladder"/"the switch gates selection only" sentence corrected (no switch
  left); the ~1900-word "Lean-orchestrator boundary" paragraph pruned of every
  fast-advance/full-advance/phase4-advance/phase1-research.md reference while preserving the
  Opus/contractor/adaptive-node boundary description; the ~900-word "Full-path Phase 5 review
  boundary" paragraph (100% about the deleted kaola-workflow-full-advance.js) replaced with a
  short pointer to the live adaptive reviewer contract.
- **docs/conventions.md**: "All ten dispatch-capable Codex skills" corrected to "All four" (
  verified: `plugins/kaola-workflow/skills/` now has exactly `adapt/finalize/init/next/plan-run`,
  and only 4 of those 5 carry the `PIN: codex-profile-preflight` marker — grepped directly);
  "## Full-Path Review/Fix/Re-Review Contract" (~38 lines of the retired Phase-5 mechanical
  contract) replaced with a retirement pointer; "## Adaptive is the Default; Fast/Full are
  Install-Time Opt-ins" section rewritten to "## Adaptive Is the Only Workflow Path", updating
  every sub-bullet (path legality, router, authoring-allowed, no-fallback, bundle lane) off the
  opt-in framing and pointing Supersedes at D-725-01.
- **docs/opencode-edition.md** / **docs/kimi-edition.md**: command-count references corrected
  (11→5, matching the verified `ls commands/*.md` count); test-suite assertion counts corrected
  to the values I re-ran myself (opencode 525→396, kimi 577→440); the K1/P0 count-and-partition
  assertion descriptions corrected to match n7's actual retirement (P2-P6/P2-P3 opt-in-deploy
  probes deleted, partition now `adaptive-core` exactly); the "Installer command-set partition"
  sections + install-usage code blocks reworded to state the FOUNDATIONAL fact that canonical no
  longer HAS a fast/full source for `--with-fast`/`--with-full` to deploy, WITHOUT claiming the
  flags themselves were removed from `install-opencode.sh`/`install-kimi.sh` (they were not, per
  binding constraint); the retired full-path Phase-5 review paragraph in opencode-edition.md
  (lines 47-54, pre-edit) replaced with a pointer to the adaptive reviewer contract.
- **CLAUDE.md**: see "CLAUDE.md line count" above.
- **CHANGELOG.md**: one new `### Removed` entry under `[Unreleased]` (Phase A), including an
  honest "Known residual, not closed by this phase" clause naming the Codex finalize/init SKILL
  packs + install-opencode.sh/install-kimi.sh/.env.example gaps — consistent with this
  changelog's existing convention of disclosing residuals rather than overclaiming completeness.
  No existing entry modified or removed.
- **docs/decisions/D-725-01.md**: new file, ~173 lines, format-matched to D-538-01/D-543-01/
  D-703-01 (Date/Status/Issue/Supersedes/Related header, Context/Decision/Alternatives
  considered/Consequences body). Includes a "Known residual (not closed by Phase A)" section
  naming the same two open gaps as the CHANGELOG entry, so neither doc silently claims a wider
  scope than what actually shipped.

## scoped verification performed

1. `git status --porcelain` — confirms exactly the 10 declared write-set paths touched (9 `M` +
   1 new `docs/decisions/D-725-01.md`); `docs/decisions/{D-538-01,D-543-01}.md` show zero diff.
2. Fenced-code-block balance check (`grep -c '^```'` parity) on all 10 files — all even/balanced.
3. My added JSON snippets (the `adaptive_plan_missing` refusal envelope, quoted twice — once in
   docs/api.md, once in D-725-01.md) parse as valid JSON (`python3 -c "json.loads(...)"`).
4. `node -e "require('./scripts/kaola-workflow-claim.js')"` — loads OK (sanity that I did not
   accidentally touch a `.js` file).
5. `node -e "JSON.parse(require('fs').readFileSync('package.json','utf8'))"` — still valid (I
   never touched it; confirms untouched-file assumption).
6. `node scripts/test-opencode-edition.js` / `node scripts/test-kimi-edition.js` — still 396 /
   440 assertions, green (docs changes have no code-path effect; run to reconfirm the exact
   numbers I wrote into the two edition docs one more time before closing).
7. Grepped every one of the 9 non-ADR files post-edit for residual
   `\bfast\b|\bfull\b|phase[1-6]|installed_paths|with-fast|with-full|WORKFLOW_PATHS|
   full-advance|fast-advance` tokens; every remaining hit is either (a) intentional accurate
   retirement prose, (b) Trap-1 vocabulary (`escalated_to_full`, "full diff/envelope/snapshot",
   git "fast-forward", `review_attestation: full_review_completed`), or (c) the deliberately
   untouched opencode/kimi installer flag sections (binding-constraint carve-out).
8. Verified no dangling `#other-paths-fast-and-full-optional`-style anchor references remain
   after removing/renaming the README section that used to be linked from two places.

## before_result

Baseline: 8 of the 9 docs files still described `fast`/`full` as live, install-time-opt-in
workflow paths (install flags, config field, transaction scripts, router keyword escapes,
Phase 1-5 artifact tables); `docs/decisions/` had no D-725-01. CHANGELOG had no Phase-A entry.

## after_result

All 9 docs files converged to the adaptive-only reality that n2-n9 actually shipped, with every
non-trivial behavioral claim verified against the landed code rather than assumed; the two
opencode/kimi installer flag surfaces (an explicit, task-acknowledged unowned gap) were left
factually accurate without being claimed retired. New superseding ADR D-725-01.md authored,
naming D-538-01/D-543-01 in its Supersedes section (both left byte-untouched). One CHANGELOG
entry added under `[Unreleased]` documenting Phase A, including an honest disclosure of the two
residual gaps (Codex finalize/init SKILL packs; opencode/kimi/.env.example installer staleness).
CLAUDE.md stays at 142 lines. No commit made.
