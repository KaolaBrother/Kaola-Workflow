# Adversarial verification receipt

verdict: fail
findings_blocking: 5

Analytical result: **refuted**.

Confidence: **high**. Four independent counterexamples were reproduced against candidate bytes, and the fifth is an explicit claim-to-contract gap confirmed by the latest Issue comments and PR text. Uncertainty counts against the claim, but the result does not depend on uncertainty.

## Supplied claim and surface

Claim: `Candidate 8aebfaa823352320dc3b2e6e32a1a3a7e31ceca8 makes PR #1041 satisfy the latest corrected Issues #1039/#1037 contract without conflating Cursor CLI, local IDE App, or App-started Cloud hosts, and its tests would reject the semantic opposite.`

Surface: `the complete diff from base b78d006c28a3849b3bcbceffdd1ebc07f2ef5115 through candidate 8aebfaa823352320dc3b2e6e32a1a3a7e31ceca8 in /Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-1037-1039, including installer/doctor, runtime capabilities, project-instruction active-run adoption, generated next/finalize/init surfaces, and their tests. Later Issue comments override bodies; PR explicitly says local IDE and fresh Cloud boot are unclaimed.`

## Contract correction established before testing

- Issue #1039's latest comment says no Acceptance item is removed after PR #1038. It specifically says local Cursor App/IDE testing is still required for Acceptance 6, a fresh pre-boot Cloud consumer is still required for Acceptance 7, global-only behavior for every supported runtime still needs two clean repositories, and explicit materialization still needs freshness/collision/doctor behavior.
- Issue #1037's latest substantive comment assigns installation/surface behavior exclusively to #1039 and retains active-run compatibility, outcome-level Mission Lists, consent, and state/schema fencing in #1037.
- PR #1041 says local Cursor IDE Agent, fresh pre-boot Cloud consumer, Cursor CLI re-probe, and Cloud boot-load are not claimed; it also says full walkthrough and all-four chains were not run on that host.

finding: id=R1 scope=in_scope action=fix status=open severity=high fix_role=implementer rationale=project materialization remains implicit and destructively overwrites unowned files

### R1 — project materialization is neither explicit nor collision-safe

- Failure class: authorization/ownership boundary; persistence and destructive migration.
- Primary anchor: `scripts/kaola-workflow-ensure-cursor-catalog.js:39-71` selects `<cwd>/.cursor/agents` from ambient process cwd and overwrites every differing canonical basename with `fs.copyFileSync`.
- Secondary anchors: `scripts/sync-cursor-edition.js:265-283,366-390` installs that copier as an automatic `sessionStart` hook; `install-cursor.sh:192-250,355-407` copies/removes canonical basenames without an ownership manifest, collision refusal, content check, version, or hash.
- Contract conflict: #1039 D3/D4/D6 and Acceptance 4/8 require explicit surface intent, an explicit target, collision safety, one installed authority, freshness/version/hash evidence, and preservation of unmanaged project files. Ambient cwd alone must not select materialization.
- Concrete counterexample 1: install globally into an isolated `CURSOR_HOME`, create a consumer `.cursor/agents/implementer.md` containing owner bytes, then invoke the installed catalog helper from that consumer as the global `sessionStart` mapping does. Observed: global install initially left the project untouched, helper exited 0 with `copied`, and the owner file changed to generated `name: implementer` bytes.
- Concrete counterexample 2: place owner bytes at explicit target `.cursor/agents/implementer.md`, run `install-cursor.sh --target <fixture> --yes --no-scripts`, then uninstall. Observed SHA changed from `9f685b8ed17b190eed46a809cb7d4153f0996a92ee840685df506dbb5094030b` to `2375574b15bc4767ee528ce7531bd3d5b2bbed295409f8df66504332612bd31c`; uninstall then deleted the canonical-name file.
- Concrete counterexample 3: make `.cursor/agents/implementer.md` a symlink to an owner file outside the project catalog and run the explicit target install. Observed: install exited 0, the symlink remained, and the outside owner file was overwritten with the generated profile.
- Test-to-claim gap: `scripts/test-cursor-edition.js:1931-1948` affirmatively requires the implicit sessionStart ensure hook. Its collision fixtures use non-canonical `notes.md`, so they cannot detect canonical-name overwrite, symlink traversal, or uninstall deletion. The clean-checkout Cursor suite passed 871 assertions while all three counterexamples remained.

finding: id=R2 scope=in_scope action=fix status=open severity=medium fix_role=implementer rationale=doctor reports static adapter declarations instead of the effective installed surface and freshness

### R2 — doctor does not diagnose the effective installed surface

- Failure class: claim-to-implementation gap and false diagnostic authority.
- Primary anchor: `scripts/kaola-workflow-cursor-surface.js:37-85` only reads checked-in `runtime-capabilities.json` and flattens the selected static row. It does not inspect `CURSOR_HOME`, a target repository, installed catalog bytes, collisions, a live catalog, Cursor CLI/App binaries, or runtime/App build.
- Secondary anchors: `install-cursor.sh:120-124`; `scripts/test-cursor-edition.js:1247-1272` asserts static literals and only the Kaola-Workflow package version.
- Concrete counterexample: run `--doctor --json --product cli --host local` once with an empty isolated `CURSOR_HOME`, and again with an arbitrary `agents/implementer.md` present. Both exited 0 and returned byte-equal selected discovery/catalog/reload/evidence facts. The report has no `effective_profile_scope`, top-level runtime/App build, project target, freshness/hash, or collision result.
- Contract conflict: #1039 D6/D7 and Acceptance 4/9 require the doctor to answer which installed version produced project materialization, whether it is current, whether owner files collide, whether the active surface discovers it, the effective scope, runtime/App build, catalog, and restart boundary. A static source declaration does not answer current installed state.
- Test-to-claim gap: the doctor test would remain green if installed files were absent, stale, collided, or undiscoverable because it never changes or inspects those states.

finding: id=R3 scope=in_scope action=fix status=open severity=high fix_role=implementer rationale=state_schema_incompatible is an unreachable label and incompatible active state is rewritten around

### R3 — active-run state/schema fencing is advertised but unreachable

- Failure class: invalid-state handling; vacuous acceptance.
- Primary anchor: `scripts/kaola-workflow-project-instructions.js:204-239,247-275,323-412` can map a supplied synthetic classification named `state_schema_incompatible`, but no production classifier inspects a state schema or emits that classification. Active-run detection only regex-matches `status: active` at lines 95-109.
- Concrete counterexample: use the exact v9 instruction pair from `a503edd8`, add an active `workflow-state.md` containing `schema_version: 999` and an unknown required field, plus an in-flight Mission List carrying an unknown required field, then run exported `execute('apply', fixture)`. Observed: status `applied`; both `AGENTS.md` and `CLAUDE.md` were written; reasons were only `known_v9_universal_authority` and `authority_layout_equivalent`; `state_schema_incompatible` was not reported. State and Mission List bytes happened to remain unchanged, but the required incompatible-state classification/fence did not exist.
- Boundary counterexample: an active run with both instruction files missing was classified `authority_layout_equivalent` and both files were created with an adoption receipt, even though adding a first universal authority changes execution defaults and no consent was represented.
- Contract conflict: #1037 Acceptance 7/9/10 requires all four compatibility classes to be real per managed change, execution-default changes to wait for conversation consent, and a state/schema-incompatible fixture to remain preserved or follow an explicit tested migration.
- Test-to-claim gap: `scripts/test-runtime-agent-architecture.js:912-930` only calls `compatibilityFor` with a fabricated `state_schema_incompatible` object. There is no production-path fixture that causes the classifier to emit it. The clean-checkout suite passed 762 assertions with the incompatible-state counterexample intact.

finding: id=R4 scope=in_scope action=fix status=open severity=high fix_role=implementer rationale=generated workflow-init still performs a runtime-global profile installation

### R4 — workflow-init still installs runtime assets and therefore is not runtime-independent

- Failure class: generated-consumer/caller contradiction.
- Primary anchor: `templates/routing/init.skeleton.md:145-159` tells the Codex init surface to resolve and execute `install-codex-agent-profiles.js --global`.
- Secondary anchors: the same executable block is present at lines 47-58 of each generated Codex init skill: `plugins/kaola-workflow/skills/kaola-workflow-init/SKILL.md`, `plugins/kaola-workflow-gitlab/skills/kaola-workflow-init/SKILL.md`, and `plugins/kaola-workflow-gitea/skills/kaola-workflow-init/SKILL.md`. The three command-runtime init surfaces do not contain it.
- Contract conflict: #1039 D1 and Acceptance 10 say workflow-init does not install, refresh, or choose runtime catalogs/profiles/commands/skills/hooks/adapters and produces the same portable repository operation regardless of invoking runtime. #1037's corrected Acceptance 11-13 keeps installation adapter-owned and says init leaves runtime/global assets byte-identical.
- Semantic opposite: the prose says “workflow-init does NOT install them per repo” immediately before executing a global installer. Global rather than per-repository scope does not satisfy “does not install.”
- Test-to-claim gap: both focused clean-checkout suites passed while this executable install remained in every generated Codex init skill; no oracle forbids an init surface from invoking a runtime installer.

finding: id=R5 scope=in_scope action=fix status=open severity=high fix_role=investigator rationale=mandatory live surface and global-discovery acceptance remains explicitly unproved and tests substitute declarations

### R5 — required behavioral evidence is explicitly absent

- Failure class: claim-to-acceptance gap and evidence substitution.
- Primary anchors: `templates/agents/runtime-capabilities.json` marks Cursor local App `unprobed`, marks the CLI stamp `prior_probe_not_re-run_here`, and records App-started Cloud without a fresh pre-boot project-consumer proof. Non-Cursor `install_scope` rows are static `documented` or `documented_live_unverified` declarations.
- PR #1041 explicitly says local Cursor IDE Agent, fresh pre-boot Cloud consumer, Cursor CLI re-probe, and Cloud boot-load are not claimed, and full walkthrough/all-four chains were not run on that host.
- Latest #1039 correction explicitly retains Acceptance 2, 6, 7, and 13: two unrelated global-only clean-repository behavioral lookups for every global-capable runtime; independent local App probe; fresh pre-boot App-started Cloud consumer; mutation oracles plus walkthrough and producer chains.
- No candidate test exercises a real local App catalog/dispatch, a fresh Cloud boot with pre-existing project assets, or two unrelated clean repositories for all runtimes marked global-capable. Static JSON/string assertions cannot replace those behavioral probes.
- Because those acceptance items were expressly retained, “unclaimed” is honest PR disclosure but directly refutes the supplied claim that the candidate satisfies the latest corrected contract.

## Material falsification attempts and observed outcomes

| category | command/input/state | observed result |
| --- | --- | --- |
| Candidate identity | `git rev-parse HEAD`; base/candidate diff inventory | HEAD was exactly `8aebfaa823352320dc3b2e6e32a1a3a7e31ceca8`; 46 changed files across the supplied surface. |
| Latest authority | `gh issue view 1039`, `gh issue view 1037`, `gh pr view 1041` | Latest comments retained all #1039 acceptance items and assigned the stated ownership split; PR explicitly listed live probes and full validation as unclaimed. |
| Ambient global install boundary | existing git/non-git fixtures plus direct isolated run | Immediate `install-cursor.sh --global` no longer writes the invoking repository. This narrow subclaim survived. The installed automatic sessionStart helper subsequently wrote ambient cwd and overwrote a canonical owner collision, refuting the complete explicit-materialization claim. |
| Collision/persistence | canonical-name regular file, symlink to outside owner file, install then uninstall | Regular owner bytes overwritten; symlink target outside catalog overwritten; uninstall deleted canonical-name file. |
| Invalid active state | v9 pair + active schema version 999 + unknown required fields | Migration applied and never emitted `state_schema_incompatible`. |
| Missing active authority | active state/Mission List with no AGENTS/CLAUDE | Both instruction files created as `authority_layout_equivalent` without consent. |
| Doctor state variation | empty vs populated isolated `CURSOR_HOME` | Same selected diagnostic facts; no effective scope/build/freshness/collision measurement. |
| Generated consumers | inspected all six generated init surfaces and canonical skeleton | Three Codex skills execute a global profile installer; three command surfaces do not. |
| Mission wording | inspected next/finalize/consumer templates and mutation detectors | Outcome-level/custody/freeze wording is propagated and the narrow phrase mutations are detected. No counterexample was found in that prose-only sub-surface. |
| Runtime host separation wording | inspected Cursor adapter and rendered guidance | CLI, App local, and App-started Cloud rows/wording are structurally separated and unknown is retained for local App. The missing live evidence and static doctor prevent this structural separation from satisfying the complete contract. |
| Focused tests in supplied worktree | `node scripts/test-cursor-edition.js` | Execution problem: stopped on stale ignored `.cursor-gitlab` generated files. This is not an analytical indeterminate and cannot be used as candidate evidence. |
| Focused tests in fresh exact-candidate clone | `node scripts/test-cursor-edition.js`; `node scripts/test-runtime-agent-architecture.js` | Passed 871 and 762 assertions respectively while R1-R4 remained. Cursor suite reported all three generated trees absent/not checked before later generating its fixtures. This is direct evidence that tests accept the opposite semantics. |
| Concurrency/atomicity | inspected active-run writer and receipt paths | Instruction writes are rename-atomic and receipts are atomically replaced. No separate concurrency counterexample was needed after the independent refutations; no concurrency claim is used to inflate the finding count. |
| Expensive completion commands | walkthrough and all producer chains | Not run after concrete refutation, per adversarial-verifier policy. PR also explicitly says these were not run on its host, so no exact-candidate completion evidence was supplied by the candidate. |

## Closure

The claim is refuted. The candidate does structurally distinguish Cursor CLI, local IDE App, and App-started Cloud rows, and its immediate `--global` installer no longer dual-writes the invoking Git repository. Those surviving subclaims do not rescue the complete claim: automatic ambient materialization remains installed, project collisions are destructive, doctor is not an effective-state diagnostic, state/schema fencing is unreachable, Codex workflow-init still installs runtime-global assets, and mandatory live probes are expressly absent. The focused suites pass these semantic opposites.
