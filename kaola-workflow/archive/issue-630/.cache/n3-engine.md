evidence-binding: n3-engine 45f1a1faa131

# Layer 2 — routing-surface generation engine (n3-engine)

## RED -> GREEN (engine self-test + byte-equality gate)

RED: test-generate-routing-surfaces "REGION dropped (skill) leaves exact bytes" — AssertionError: expected "head\ntail", actual "head\n\ntail" (engine newline-fidelity deliberately broken: dropped REGION emitted a stray blank line); with the same break, `generate-routing-surfaces.js --check` reported DRIFT on all 12 surfaces + exit 1.
GREEN: engine restored — `node scripts/test-generate-routing-surfaces.js` passes 33/33 assertions (exit 0); `node scripts/generate-routing-surfaces.js --check` byte-matches all 12 surfaces (exit 0).

## CRITICAL acceptance (§4.6) — byte-for-byte no-op on first run

- `node scripts/generate-routing-surfaces.js --write` rendered all 12 surfaces, then `git diff --quiet` over commands/ + the gitlab/gitea/github command+skill trees returned exit 0 (ZERO diff).
- `node scripts/generate-routing-surfaces.js --check` -> exit 0: "all 12 surfaces byte-match the skeleton."
- `git diff --stat` on the 12 plan-run + next surfaces -> EMPTY. The only untracked files are my 6 new files (+ Layer-1's required-blocks.js, which I did not touch); no tracked surface changed.

Engine model: one skeleton per topic; directives on their own comment lines —
`<!-- SLOT:* -->` (keyed frontmatter/H1/setup-resolver, resolved by surface_type then forge),
`<!-- REGION:cond -->…<!-- /REGION -->` (cond = `+`-joined AND of surface_type/forge tags; dropped region removes directives+body with exact byte layout),
`<!-- SPLICE:* -->` (per-context mid-paragraph substitution). Forge-noun renames applied after resolution via rename-table.js. NO in-file @generated banner (would break byte-identity).

## SPLICEs found

plan-run (spec listed 2; I found 8 total — the 6 beyond the 2 are load-bearing):
- pr-synth-floor  [SPEC #1]: `**Opus**-floor` (cmd) ↔ `(non-lowerable floor)` (skill) synthesizer.
- pr-alldone-intro [SPEC #2 + more]: 3-way — github-cmd (bare Self-host line + run-chains BASH FENCE), forge-cmd (`proceed to /kaola-workflow-finalize` + prose run-chains), skill (`delegate to kaola-workflow-finalize` + prose). Folds the all-done finalize-route slash difference AND the run-chains structural variant.
- pr-open-next-tail (NEW): command carries the extra "dispatch sub-object supersedes per-field assembly … dispatch.leg_path" sentence + slashed `/kaola-workflow-finalize` route; skill lacks it and routes "to finalize".
- pr-reopen-line (NEW): command "(first node, or orphan from a crash between commit and fused advance)" parenthetical vs skill bare period.
- pr-instruct-lead (NEW, 3-way): github-cmd "Pass `dispatch.nonce`…" / forge-cmd "Dispatch the base role profile … Pass `dispatch.nonce`…" / skill "Delegate to the base role profile … Apply the task-name and reasoning-effort rule above. Pass…".
- pr-fill-stubs (NEW): command "Fill in token stubs from its work;" vs skill "Fill in token stubs;".
- pr-test-thrash (NEW): command top-level bullet `- \`test_thrash\`…` vs skill continuation line `  \`test_thrash\`…`.
- pr-dispatch-next (NEW): command "dispatch the next node (step 3) — it is already open." vs skill "… (step 3).".
Plus two `REGION:command+github` blocks (position-A "Dispatch the base role profile … Set `Working directory: ${ACTIVE_WORKTREE_PATH}`" and the trailing "Then proceed to `/kaola-workflow-finalize {project}`.").

next (49 machine-derived 3-way splices nx-cmd-001..024 / nx-sk-001..025 from a 3-way LCS merge of the committed surfaces, byte-exact by construction): forge nouns GitHub/GitLab/Gitea, gh/glab/tea (incl. distinct issue-view/-list flags), PR/MR + watch-pr/watch-mr (github+gitea use PR, gitlab MR), the claim/roadmap/repair-state/classifier script renames + forge scripts-dir paths in the kaola_script/claim_script/preflight_script/repair_script bash blocks, the adapt.md path, the 3-way PR/MR-Intent-Capture blocks, and the skill's startup-refusal/git-freshness structural REORDER (nx-sk-019/020/021). The github-only Goal-context block and the forge-skill-only inserts are emitted as forge `REGION:github` / `REGION:gitlab` / `REGION:gitea` blocks (insertion/deletion cases). Outer `REGION:command` / `REGION:skill` split the two divergent bodies; nx-frontmatter (2-shape) + nx-h1 are the shared surface_type slots.

## Design invariants confirmed

- resolve-agent-model STAYS un-renamed on all editions: rename-table.js contains ONLY `kaola-workflow-adaptive-node.js`; self-test asserts `applyRenames(...resolve-agent-model.js, gitlab|gitea)` is identity; it sits in the command-only Agent Model Badge (commands/*.md:33) and `--check` byte-matches all 3 command forges (un-renamed).
- run-chains is a surface_type×forge STRUCTURAL variant, NOT a rename: `kaola-workflow-run-chains.js` bash fence appears ONLY in the github plan-run COMMAND (pr-alldone-intro.github); forge commands + all skills use the prose one-liner — encoded in the 3-way pr-alldone-intro splice, never in the rename table.

## Verification exit codes (all 0)

- node scripts/generate-routing-surfaces.js --check           -> 0 (12/12 byte-match)
- git diff --quiet on the 12 surfaces                         -> 0 (empty)
- node scripts/test-generate-routing-surfaces.js              -> 0 (33 assertions)
- node scripts/test-route-reachability.js                     -> 0 (281 assertions)
- node scripts/validate-workflow-contracts.js                 -> 0
- node scripts/validate-kaola-workflow-contracts.js           -> 0
- plugins/kaola-workflow-gitlab/.../validate-...-gitlab-contracts.js -> 0
- plugins/kaola-workflow-gitea/.../validate-...-gitea-contracts.js   -> 0
- node scripts/validate-script-sync.js                        -> 0
- node scripts/simulate-workflow-walkthrough.js               -> 0

Write set (6 NEW files, created; touched nothing else):
- scripts/generate-routing-surfaces.js
- scripts/test-generate-routing-surfaces.js
- templates/routing/plan-run.skeleton.md
- templates/routing/next.skeleton.md
- templates/routing/slots.js
- templates/routing/rename-table.js

delegation_outcome: completed
