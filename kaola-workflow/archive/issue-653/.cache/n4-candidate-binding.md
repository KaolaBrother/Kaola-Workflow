evidence-binding: n4-candidate-binding 9c525d832610
upstream_read: n1-design 3dee366bd213
upstream_read: n2-attestation 7ec679259eca
upstream_read: n3-sink-journal b039e808d87b

RED: before any implementation edit, the five new #653 consumer-binding walkthrough cases (added
beside the #475/#556 consumer cases in testBundle424432433ValidatorGates) failed against the
unmodified validator. Case (a): `node scripts/simulate-workflow-walkthrough.js --only
testBundle424432433ValidatorGates` -> `Error: #653 (a): a pass verdict with no
validated_candidate_hash must refuse final_validation_unbound, got status 0
{"result":"pass","mode":"final-validation","checkedChanges":2,"chains":[]}` — the exact fail-open
finding C describes: a bare `verdict: pass` final-validation.md passed the consumer finalize gate
with zero binding to the tree it validated. Producer-mode RED, probed directly in a scratch git
repo: `kaola-workflow-plan-validator.js <plan> --candidate-hash --json` fell through to DEFAULT
whole-plan validation (emitted `{"result":"refuse","reason":"plan_invalid",...,"errors":["G1:
code-reviewer does not post-dominate..."]}` exit 1 — grammar output, never `mode:"candidate-hash"`),
proving the flag did not exist. After the gate landed, the intended second RED from the spec also
fired: the pre-existing #475 (a) fixture refused
`{"result":"refuse","reason":"final_validation_unbound",...}` until its fixture was re-recorded
with a producer-emitted hash (n1-design C5 named this the intended RED for legacy fixtures).

GREEN: all five #653 cases + updated legacy fixtures pass. `node
scripts/simulate-workflow-walkthrough.js --only testBundle424432433ValidatorGates` ->
`testBundle424432433ValidatorGates: PASSED` (cases: (a) no-hash -> final_validation_unbound; (b)
recorded hash + relevant working-tree edit -> final_validation_stale carrying
recorded_candidate_hash + current_candidate_hash; (c) matching hash -> result:pass +
validated_candidate_hash echoed, proving producer==gate recompute; (d) workflow-state +
docs/decisions edits after recording -> still pass (validation-invisible does not stale); (e)
producer determinism across invocations + --current-code-tree seam pass/stale legs). `node
scripts/simulate-workflow-walkthrough.js` full suite -> "Workflow walkthrough simulation passed"
(includes testKeepOpenArchiveStamp's NEW negative leg: cmdFinalize with a WRONG 64-hex hash refuses
`finalize_gate_unverified` with `inner_reason: final_validation_stale`, live folder SURVIVES and no
archive exists — the refusal fires BEFORE any archive/commit side effect — then re-recording the
producer hash finalizes `status: closed`). Four cross-edition chains run SEQUENTIALLY, each exit 0:
`npm run test:kaola-workflow:claude` CLAUDE_EXIT=0; `npm run test:kaola-workflow:codex`
CODEX_EXIT=0 (codex walkthrough "Kaola-Workflow walkthrough simulation passed" inside it); `npm run
test:kaola-workflow:gitlab` GITLAB_EXIT=0; `npm run test:kaola-workflow:gitea` GITEA_EXIT=0. Also
independently green: `node plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js`
-> "GitLab workflow walkthrough simulation passed"; gitea walkthrough -> "Gitea workflow walkthrough
simulation passed"; `node scripts/edition-sync.js --check` -> "10 forge aggregator ports, 24
COMMON_SCRIPTS mirrors, and 27 byte-identical groups in parity" (idempotent after --write); `node
scripts/generate-routing-surfaces.js --check` -> "all 12 surfaces byte-match the skeleton"; `node
scripts/validate-script-sync.js` -> "OK: 24 common scripts, 27 byte-identical groups, 8
rename-normalized families, 2 hooks.json families (config + hooks dir), and 7 forge export-superset
families in sync."; `node scripts/test-route-reachability.js` -> "Route-reachability test passed
(369 assertions)."; contract validators green: root claude ("Workflow contract validation passed"),
codex ("Kaola-Workflow Codex contract validation passed"), gitlab, gitea. NOTE on "the 5 contract
validators": 4 are runnable from a repo checkout and are green; the 5th declared file
(plugins/kaola-workflow/scripts/validate-workflow-contracts.js) is the codex BYTE-COPY — it is
byte-synced (md5 31ff11f80b090bf335ffb7cc0d1f7e81 == root) but not runnable from a repo checkout
(expects the installed layout; fails `commands/kaola-workflow-phase1.md is missing`) — PROVEN
PRE-EXISTING by `git stash` (identical failure on the clean tree) then `git stash pop`.

## claim.js: ZERO hunks from this node (confirmed)

Per n1-design C ("cmdFinalize ALREADY shells --finalize-check before any side effect — the #522
gate — so C needs ZERO claim.js change"): verified against live code — claim.js's #522 gate block
shells `--finalize-check --json` and refuses `finalize_gate_unverified` BEFORE `archiveProjectDir`,
so the binding lives entirely inside the validator. `scripts/kaola-workflow-claim.js` + codex
byte-copy both still md5 `b8fce212135edd714601e1986d8ecbc4` — the exact hash n2/n3 recorded at
their close — confirming this node's accumulated-diff contribution to claim.js is zero (n6 mirrors
only n2's + n5's hunks).

## Anchors verified against n1-design before editing

- Consumer gate arm PV:3354-3368 (final_validation_unverified :3359-3361, final_validation_failed
  :3363-3366, `schema.parseNodeVerdict` at :3363) — matched exactly pre-edit.
- computeCodeTreeHash PV:2364-2377 (null on git failure = fail-closed), isValidationInvisible
  PV:321-328 (`kaola-workflow/` tree + docs allowband invisible; test-consumed prose stays CODE),
  parseValidationTestConsumes PV:502-507 (Meta-scoped), projTag PV:2782, hint table PV:107-108,
  `--current-code-tree` seam PV:3319, precedence comment PV:3235 — all matched.
- adaptive-schema parseNodeVerdict :527-539 (the discipline template) + module.exports :1263.
- GENERATED surfaces: plan-run command+SKILL ×6 render from templates/routing/plan-run.skeleton.md
  via generate-routing-surfaces (n3's discovery, honored — zero hand-edits to rendered files);
  plan-validator + adaptive-schema propagate via `npm run sync:editions` (edition-sync
  GENERATED_AGGREGATORS + byte-identical groups) — canonical-root-only edits, confirmed.
- rename-table.js has NO plan-validator entry (only adaptive-node.js), so the skeleton prose uses
  the file's established forge-neutral `…-plan-validator.js` ellipsis device instead of a concrete
  basename that would render wrong on gitlab/gitea (rename-table is outside this node's write set).

## Shipped contract (exact names/fields)

New typed refusals (plan-validator, consumer --finalize-check arm + producer):
- `final_validation_unbound` — no well-formed column-0 `validated_candidate_hash:` line in
  .cache/final-validation.md (fail-closed: `!present || !hash`, so a malformed 64-hex refuses the
  same as an absent field; legacy no-hash files degrade to this typed refusal, never a silent pass).
- `final_validation_stale` — recorded hash != recomputed current code-tree hash; refusal payload
  carries `recorded_candidate_hash` + `current_candidate_hash`.
- `candidate_hash_unavailable` — producer mode, computeCodeTreeHash returned null (git failure),
  exit 1.
New CLI mode: `--candidate-hash [--json]` (beside --finalize-check; placed before it in main()) —
emits `{result:'ok', mode:'candidate-hash', validated_candidate_hash:<64-hex>}`; non-JSON output
prints the exact recordable column-0 line. Band source = the frozen plan's `## Meta`
`validation_test_consumes` via parseValidationTestConsumes(content) — the shared band source, so
producer and gate derive the identical band by construction; hashRoot = git rev-parse
--show-toplevel (same discipline as the #547 self-host arm).
Gate precedence (comment + help updated): final_validation_unverified > final_validation_failed >
final_validation_unbound > final_validation_stale. Consumer `--current-code-tree` reuses the
existing self-host seam name. Pass payload: consumer mode gains `validated_candidate_hash`
(boundCandidateHash stays null on the self-host arm → key omitted → SELF-HOST chain-receipt
emission byte-unchanged in decision terms; #648 citation fields untouched — they are prose-only,
no parser exists, and every surface keeps naming all four alongside the new hash line). Two new
operator hints (unbound/stale) verbatim from n1-design C3; #475 honored — the gate compares two
hashes and executes no tests anywhere (asserted structurally: the consumer fixtures have no
package.json/suite at all).
New parser: adaptive-schema `parseValidatedCandidateHash(text)` -> `{present, hash}` — pure,
native multiline regex, fence-blind column-0 anchor, last-well-formed-match-wins, lowercased;
exported; ×4 byte-identical (md5 197cb6354b9a3181c1f397bc7c58955e all four).

## Per-file summary

- scripts/kaola-workflow-plan-validator.js — 3 hints, precedence comment, --candidate-hash mode,
  consumer binding gate (+`boundCandidateHash` echo), printHelp; CANONICAL-ONLY edit; codex copy md5
  c91dd967cbdb526d8c3fdad751db239e == root; gitlab/gitea ports regenerated by sync:editions.
- scripts/kaola-workflow-adaptive-schema.js (+3 copies) — parseValidatedCandidateHash + export.
- scripts/simulate-workflow-walkthrough.js — #653 cases (a)-(e) + candidateHashOf/commitImpl
  helpers; #475 (a)/(d) fixtures re-recorded with producer hashes; testKeepOpenArchiveStamp
  stale-then-rebind negative leg (no-side-effect proof); issue-860/861/530 worktree fixtures append
  the hash LAST (post feature-commit + worktree-finalize); #539 seedProject binds at seed time (its
  later mutations are all validation-invisible).
- plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js +
  plugins/kaola-workflow-gitea/scripts/simulate-gitea-workflow-walkthrough.js — issue-970 m2
  consumer fixtures produce the hash via each edition's own valScript --candidate-hash (the
  regenerated forge plan-validators enforce the gate through the forge claim ports' existing
  --finalize-check shell, so no forge claim-port change was needed for these to pass).
- templates/routing/plan-run.skeleton.md — All-done consumer block: bind-after-verdict rule
  (compute LAST, stale/unbound refusals, invisible-does-not-stale, compares-hashes-never-re-runs);
  De-Dup: citations require a fresh hash computed at citation time. Rendered to all 6 plan-run
  surfaces + verified byte-match (templates/routing/slots.js untouched by this node — its M status
  is n3's pr-alldone-intro edit).
- commands/kaola-workflow-finalize.md — final_validation_unbound + final_validation_stale refusal
  bullets (payload fields named), compares-hashes-never-re-runs sentence, citation paragraph gains
  the fresh-hash requirement.
- plugins/{kaola-workflow,-gitlab,-gitea}/skills/kaola-workflow-finalize/SKILL.md — the consumer
  paragraph (verified byte-identical across the trio pre-edit, kept identical) extended with both
  refusals + producer + remedy; the numbered Final-validation step gains the bind-LAST instruction.
- agents/contractor.md + contractor.toml ×3 — consumer remedy line (re-run + re-record with a
  fresh hash; never hand-patch; unbound/stale named); TOML trio byte-identical before
  (9a32a83013f8e53f29c13219af6479a4) and after (595db6e4dd37b617914000e1c28faf11).
- Contract validators — needles: root claude validator pins 'validated_candidate_hash' in
  commands/kaola-workflow-plan-run.md (+ codex byte-copy synced); codex/gitlab/gitea validators
  each pin it in their plan-run SKILL + finalize SKILL.
- Declared-but-untouched, confirmed: scripts/kaola-workflow-claim.js + codex copy (zero hunks,
  md5-pinned), plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js (codex
  walkthrough has no consumer-gate fixtures — ran green unchanged), scripts/test-route-reachability.js
  (369 assertions green unchanged), templates/routing/slots.js.

Provenance: `grep -rln '#653|issue-653'` across commands/, agents/, skills ×3 packs, TOMLs, and the
skeleton returns NOTHING — issue refs live only in code comments/tests/evidence. No new files
created; every changed path is inside the declared write set (rendered plan-run mirrors + edition
ports arrive via their declared generators).
