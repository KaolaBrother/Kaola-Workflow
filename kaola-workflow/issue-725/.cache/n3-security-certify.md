evidence-binding: n3-security-certify ef7db60618c3
contract_version: 2
review_context_hash: f21bae9c5ad49637d3a56b77e96d6e398466df97d919d71d010911606d2e41c1
behavior_contract_hash: 1c9771f6f29f9a130b65aaf491dff9cf1691402dbdce489254a6248361026584
resolved_profile_hash: a6f7566a03d5ccdc8d890da743b41915e2d18ff36e30e7058bfdd41459cf041d
candidate_digest: 76dbc15d1d085d2697bdbfdfccbfe8a748dee26dc32f15d5835c95fa22bac7ce
gate_mode: change_gate
gate_aggregation: sequence

upstream_read: n2-code-certify 83bb71e5fd84

gate_claim: The repair introduces no security regression on the inherited frontier: removing the full-advance path-resolution-and-execution shell block from the three finalize SKILL packs leaves no unsafe path construction, command injection, unvalidated node execution, or symlink-escape regression, and the replacement adaptive_plan_missing refusal path performs no execution; the fixture migration and the validator fast-summary pin removal expose no credential, secret, or auth surface; classifier.js and validation-runner.js remain untouched

gate_surface: the full accumulated repair diff vs claim root base 33a1ca57 across all four editions, with emphasis on the three finalize SKILL packs removed shell-execution block and the migrated finalize fixtures, reviewed for any injection, unsafe path, privilege, or secret-exposure regression against the inherited security frontier

domain_outcome: approved
verdict: pass
findings_blocking: 0
review_summary: no_blocking_findings

findings_none: the repair delta is a strict execution-surface reduction — the three SKILL packs delete the entire full-advance preflight/path-construction/lstat-walk/node-execution block and replace it with a static non-executable text refusal (byte-identical hunks, zero full-advance/FULL_ADVANCE/phase5-verify residue), the fixture and validator edits touch only test-fixture and assertion-list code with argv-array spawnSync, mkdtemp-rooted paths, and no secret or auth material, and all classifier/validation-runner scripts across the four editions are diff-empty against the n1-repair barrier baseline.

## Security review narrative

Context and inputs: read the canonical review context (`kaola-workflow/issue-725/.cache/review-contexts/f21bae9c5ad49637d3a56b77e96d6e398466df97d919d71d010911606d2e41c1.json` — `validation_obligations` empty, `prior_findings` empty, inherited frontier classes code+security), the fix producer evidence `kaola-workflow/issue-725/.cache/n1-repair.md` (nonce `5ea5f85f1880`, sha256 `0750bedb2c212d0938cda37b5e85e0fe76c16c99e643793dcb2a5af709bc562c`), and the passing code gate `kaola-workflow/issue-725/.cache/n2-code-certify.md` (nonce `83bb71e5fd84`, approved, 0 blocking). All diffs below were computed by me directly against the barrier baseline ref `refs/kaola-workflow/barrier/issue-725/n1-repair` (`5ea5f85f1880...`), with HEAD == claim root base `33a1ca57`.

Delta containment: `git diff` vs the barrier baseline (excluding `kaola-workflow/`) resolves to exactly the 9 declared write-set files. The tenth listed path, `docs/decisions/D-725-01.md`, is a tracked-in-baseline vs untracked-on-disk git artifact only — the on-disk file byte-matches its barrier blob (sha256 `b5626e49f0d59804e09818210ab4bf6d7df16124ca48d8eb6bb4c9887b9864b6` both sides), so the repair did not touch it.

F3 — SKILL pack shell-block removal (the security-relevant surface). Each of `plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md`, `plugins/kaola-workflow-gitlab/skills/kaola-workflow-finalize/SKILL.md`, and `plugins/kaola-workflow-gitea/skills/kaola-workflow-finalize/SKILL.md` carries exactly one hunk (`@@ -208,33 +208,13 @@`), and the three hunk bodies hash identically (sha256 `a08a90ae055a...` over each diff body). The hunk deletes, as one unit: the `codex plugin list --json` plugin-tuple preflight, the tuple-sanitization `node -e` filter, the `KAOLA_CODEX_CACHE_ROOT="$HOME/.codex/plugins/cache"` path assembly into `KAOLA_FULL_ADVANCE`, the lstat symlink-refusing path walker, and the `node "$KAOLA_FULL_ADVANCE" phase5-verify` execution. The replacement is a fenced ` ```text ` block containing only the static string `BLOCKED: finalize_gate_unverified (adaptive_plan_missing) — restore the frozen workflow-plan.md before Finalization.` plus prose stating `cmdFinalize` refuses before any archive/close side effect — no executable fence, no variable interpolation, no path construction, no execution. Removing the lstat verifier is not a guard regression: the verifier existed solely to gate the now-deleted execution, and guard plus guarded execution were removed together, so nothing consumes an unverified path. Grep confirms zero `full-advance` / `FULL_ADVANCE` / `phase5-verify` residue in all three packs; the surviving `$HOME/.codex/plugins/cache` references (lines 35/76/104/168/~430/~463 — the retained plugin-root resolution and the find-based REPLAN/validator/ledger-compare/claim script lookups) sit outside the single repair hunk, are byte-unchanged from the baseline, and belong to the pre-existing inherited frontier, not this candidate.

F1 — fixture migration. The `seedAdaptiveFinalizeFixture` helpers added to `scripts/test-bundle-finalize.js`, `plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js`, and `plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js` are test-only code: every subprocess is `spawnSync(process.execPath, [argv-array])` with no shell and no string-concatenated command; script paths are fixed, derived from `__dirname`/`repoRoot`; all writes land under `mkdtempSync(os.tmpdir())`-rooted fixture trees; the seeded `final-validation.md` (`verdict: pass` + a locally computed `validated_candidate_hash`) and `workflow-tasks.json` contain only synthetic fixture data — no credential, token, secret, or auth material, and no user-controlled input reaches any of it. The gitea diff is the forge-normalized mirror of the gitlab diff (residual differences are only pre-existing forge context: sinkMr/sinkPr, line offsets, a local helper name, one comment).

F2 — validator pin removal. Each of the three validators loses exactly one string literal, `'fast-summary.md',`, from the CLAUDE.md `assertConcept('compact durable state contract')` list; the two `validate-workflow-contracts.js` copies move blob `71eb619e` to `cf61d405` identically. A documentation-assertion string list has no credential, secret, or auth surface, and loosening this one prose pin gates nothing security-relevant.

Untouchability: explicit-path diff vs the barrier baseline is empty for `scripts/kaola-workflow-classifier.js`, `scripts/kaola-workflow-validation-runner.js`, and all six edition-port classifier/validation-runner copies under `plugins/*/scripts/` — untouched as claimed.

OWASP/high-risk pattern walk over the delta: no injection surface (no shell string building anywhere in the added code), no auth/session code touched, no secret material added or logged, no access-control path changed, no deserialization of untrusted input (the `JSON.parse` calls consume output of a locally spawned repo script over fixture data), no dependency changes, no new network or filesystem reach outside test tempdirs. The only execution-bearing surface in the diff was removed, not added. Zero findings is the correct outcome; nothing reopens n1-repair.

review_attestation: full_review_completed
review_conclusion: The epoch-2 repair is security-clean on the inherited frontier — the three finalize SKILL packs excise the entire full-advance path-construction-and-execution shell block in three byte-identical hunks and replace it with a static non-executable adaptive_plan_missing refusal, leaving no injection, unsafe path, symlink-escape, or unvalidated-execution surface behind; the fixture and validator edits are argv-array test scaffolding and a single assertion-string removal with no credential or auth exposure; classifier and validation-runner scripts are diff-empty across all four editions, so the security gate approves with zero findings.
certifier_kind: security
certifier_aggregation: sequence
certifier_gate_digest: e1adba731b654b016687ea1c85fcaa38a80edb977cda7bb3ba0240f2028767c6
certifier_epoch_lineage_id: 43c25ded7e36413c9c1fdb6f1bbdb1ccc19dfae845cf6366230239d986d27997
certifier_inherited_frontier_digest: fae3cf5a388786839ff280f2fe843a8a7dbe02be2999876c9d307ced49002830
certified_candidate_digest: 8b9854fef90489dd88f06de1a80f3788a23ae5f17c9aefb8fc4ae49062bd781d
