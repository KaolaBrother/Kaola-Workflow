# Close the complete #1033/#1034 backlog and publish the verified 10.0.0 architecture

- item: Establish #1034 behavior-level acceptance and prove the current source-spelling pin fails for the wrong reason.
  status: done
  dispatched: tdd-guide owns independent #1034 acceptance in /Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-1033-1034, landing test changes in scripts/test-opencode-edition.js and RED evidence in the mission handback.
  result: scripts/test-opencode-edition.js now runs a real sandboxed uninstall and a five-suite orchestration witness; baseline RED attempted only opencode, while deleting the RETIRED_HOOKS uninstall loop made R3 fail on the observed leftover file.

- item: Repair #1034 so uninstall cleanup is tested by outcome, mutation-proven, and all five edition suites execute without short-circuit masking.
  status: done
  dispatched: self implements the smallest aggregate edition-suite runner and package wiring in /Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-1033-1034, landing production changes in scripts/run-edition-tests.js and package.json before focused verification.
  result: scripts/run-edition-tests.js and package.json now attempt all five suites and preserve any child failure; scripts/test-opencode-edition.js passed 670 assertions and the full lane passed 670+628+550+737+687 assertions.

- item: Re-measure #1033 against the claimed baseline and establish the seven-runtime instruction, role, adapter, provenance, migration, and release authority map.
  status: done
  dispatched: knowledge-lookup, code-explorer, and code-architect independently research current official runtime capabilities, map the existing source/render/install/test graph, and derive a dependency-safe implementation blueprint; outputs land in /Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-1033-1034/.cache/runtime-capability-research.md, .cache/issue-1033-source-map.md, and .cache/issue-1033-architecture-blueprint.md.
  result: Fresh official/runtime research proves Codex, OpenCode, Kimi, Grok, Cursor, and ZCode consume AGENTS.md directly within their documented scope while Claude needs a thin CLAUDE.md @AGENTS.md bridge; the source map and 743-line blueprint define one 14-role behavior authority, seven evidence-backed adapters, prompt-external provenance, ownership-safe migration, native checks, and exact 10.0.0 release ordering.

- item: Invert project instruction authority to runtime-neutral AGENTS.md with a thin Claude overlay and ownership-preserving workflow-init migration.
  status: done
  dispatched: self owns the serial production spine for root AGENTS.md/CLAUDE.md, routing skeletons, and the project-instruction migration helper so the independent acceptance remains immutable.
  result: Root AGENTS.md is now the runtime-neutral managed authority; CLAUDE.md is a thin @AGENTS.md Claude-only overlay. The generated workflow-init surface plans/checks/applies ownership-safe migration through kaola-workflow-project-instructions.js, which is installed identically for GitHub, GitLab, and Gitea and refuses ambiguous owner bytes or active-run mutation.

- item: Give all 14 roles one runtime-neutral behavioral authority and render deterministic runtime-native profiles through declared adapters.
  status: done
  dispatched: self owns the canonical behavior/capability/provenance authorities and generalized profile generator, then regenerates every tracked Claude/Codex profile and exposes logical renders to all five additive editions.
  result: templates/agents/{behavior-contracts,runtime-capabilities,provenance}.json and scripts/generate-agent-profiles.js now render 14 roles across seven runtime families (126 native renders). Claude/Codex tracked profiles, all three Codex configs, manifests, installers, preflight, and self-hash checks derive from that authority; the old reviewer-only generator, templates, identity protocol, and paraphrase suite are deleted.

- item: Remove retired Claude-first transforms and vocabulary while preserving provenance and docking the full public documentation surface.
  status: done
  dispatched: doc-updater owns documentation-only docking in /Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-1033-1034 across README.md, CHANGELOG.md [Unreleased], docs/{README,architecture,api,conventions,agents-source,runtime-capabilities,*-edition}.md, and a new ADR; it reads the landed code plus .cache/runtime-capability-research.md and does not edit production/tests.
  result: README, Unreleased changelog, documentation index, architecture/API/conventions, provenance, five additive-edition guides, the new seven-runtime capability map, and ADR 0020 now document AGENTS-first authority, thin bridges, native carriers, ownership-safe migration, and explicit unknowns; architecture passed 365 assertions and all active-doc stale-vocabulary scans are clean.

- item: Prove the complete architecture with focused mutation tests, generated-surface checks, walkthrough, edition suites, and producer-selected chains.
  status: done
  dispatched: self runs focused generator/migration/install mutation suites, every edition suite, forge validators, full walkthrough, suite-registration, and producer-selected four-chain validation; evidence lands in terminal receipts and .cache/final-validation.md.
  result: Candidate a89a39f4 passes the 427-assertion architecture suite, 476 routing assertions, 170 authority-reachability assertions, the 179-scenario full walkthrough, all five additive edition suites, and an exact-SHA unwaived Claude/Codex/GitLab/Gitea receipt.

- item: Adversarially review acceptance and close all findings, then finalize, sink, publish 10.0.0, and prove all-runtime install convergence.
  status: done
  dispatched: security-reviewer and code-reviewer independently inspect frozen candidate b128c2a0 against base a503edd8 and issues #1033/#1034; they are read-only over production and land reports at .cache/security-review-1033.md and .cache/adversarial-review-1033.md before self resolves every concrete finding and begins finalize/release.
  result: All review findings were closed before sink; #1033 and #1034 closed after main published. Release-only SHA 96a4c11197bcae5c1232b4c261a28c8ea426752c passed an exact-SHA clean, unwaived Claude/Codex/GitLab/Gitea receipt plus strict release-check and post-tag npm test; remote main and kaola-workflow--v10.0.0 matched that SHA, GitHub published it as Latest, and install-all reported PASS for Claude, OpenCode, Codex, Kimi, Grok, Cursor, and ZCode with the Codex marketplace converged to 10.0.0.

- item: Author independent #1033 architecture acceptance for AGENTS-first authority, 14-role semantic sources, seven native adapters, mutation reachability, deterministic renders, and provenance separation.
  status: done
  dispatched: tdd-guide owns #1033 acceptance tests in /Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-1033-1034 without production edits, landing test changes in scripts/ and RED evidence in .cache/issue-1033-acceptance-red.md.
  result: scripts/test-runtime-agent-architecture.js freezes 126 native renders, real project-migration fixtures, seven-runtime mutation isolation, provenance exclusion, and Claude-first retirement; overlaid on exact baseline d8573392 it failed for the intended 88 architecture gaps while 40 assertions already passed, and suite registration remains green at 589 assertions.

- item: Repair the #1034 indirect-runner registration gap without changing the five-suite execution or acceptance contract.
  status: done
  dispatched: self makes package.json the explicit edition-suite list consumed by scripts/run-edition-tests.js, then reruns registration, E0, and the full editions lane.
  result: package.json now declares the five suite paths consumed by the generic runner; suite registration passed 589 assertions, Opencode passed 670, and the full 670+628+550+737+687 lane passed.

- item: Prove one Kaola-formatted repository can switch among all supported runtimes through one universal AGENTS.md contract plus the smallest native entrypoint bridge and runtime-specific adapter for each runtime.
  status: done
  dispatched: self exercises the real project-instruction plan/check/apply fixtures, 126-profile adapter mutation/isolation tests, every runtime installer/check path, and final all-runtime global convergence without introducing a second universal instruction source.
  result: The consumer migration writes one universal AGENTS contract and only a thin Claude native bridge; 21 init surfaces reach the same module/helper without copied universal prose, while seven runtime families render 126 deterministic native profiles and all five additive installer suites pass.

- item: Replace Kimi's legacy role-contract Skill fallback with its supported native custom-agent profile bridge and direct named-role dispatch.
  status: done
  dispatched: tdd-guide independently freezes Kimi's official `.kimi-code/agents/` profile installation, native frontmatter/tool restrictions, direct named-role dispatch, uninstall/idempotency, and no-role-Skill invariants before self changes production.
  result: Kimi now renders and installs 14 ownership-marked native custom-agent profiles, dispatches `kaola-role-*` directly, retains only three command Skills, prunes the retired role-Skill fallback, and passed 784 assertions across all three forge trees.

- item: Move OpenCode role profiles from the retired singular `agent/` carrier to the current native plural `agents/` discovery path without losing owned upgrades.
  status: done
  dispatched: tdd-guide independently freezes official project/global plural-path discovery, exact 14-profile installation, singular-path retirement, ownership-safe collision behavior, check/idempotency, and uninstall before self changes production.
  result: OpenCode now renders and installs plural `agents/` and `commands/` carriers at project and global scope, hash-safely migrates owned singular carriers while preserving collisions, and passed 823 assertions across all three forge trees.

- item: Make the runtime adapter data own every runtime-only model, effort, tool, and hook carrier, with generated profiles and installers using only currently executable native surfaces.
  status: done
  dispatched: tdd-guide independently freezes adapter-owned Cursor/ZCode model identifiers, enforced Kimi/Grok/ZCode tool carriers, and ZCode user `cli/config.json` hook execution with project-hook retirement; self will repair the generator and installers only after intended RED.
  result: The adapter authority now owns Cursor/ZCode model identifiers and all native tool bindings; Grok emits supported camelCase carriers without an invalid permission mode, ZCode executes hooks only from user `cli/config.json`, generator check passes for 126 renders, and Grok/Cursor/ZCode pass 711/825/814 assertions.

- item: Retire the full-walkthrough pin that required CLAUDE.md to duplicate the universal First Principles block.
  status: done
  dispatched: self updates the existing byte-identity guard after the full walkthrough exposes its stale Claude-first subject, preserving the 23-surface anti-vacuity width while moving the root authority check to AGENTS.md and adding an explicit thin-bridge negative assertion for CLAUDE.md.
  result: AGENTS.md now embeds the canonical templates/axioms.md block byte-identically; the walkthrough proves CLAUDE.md imports AGENTS.md and does not copy the axioms, and the focused scenario plus 365-assertion architecture suite pass.

- item: Register the project-instruction migration helper's atomic replacement in the kernel writer audit.
  status: done
  dispatched: self records the helper's same-directory temp-file write and final rename in the closed writer ledger after the full chain fails closed on the previously unknown writer.
  result: The ledger names both APIs and why they meet the atomic/non-kernel boundary; real kernel vehicles pass 245 assertions.

- item: Generalize the three Codex forge walkthroughs from reviewer-only manifest identity to the complete generated 14-role contract.
  status: done
  dispatched: self repairs the full-chain findings in the GitHub, GitLab, and Gitea Codex installer/preflight fixtures without changing the generated-profile mechanism or restoring retired reviewer-only fields.
  result: All three forge fixtures now verify every installed role's role, behavior, adapter, and resolved-profile identity; installed-byte drift remains `profiles_stale`, invalid selected-source schema remains `profiles_malformed`, and the Codex/GitLab/Gitea chains pass.

- item: Make installed workflow-init load a distribution-owned consumer instruction template in every GitHub, GitLab, Gitea, and npm layout.
  status: done
  dispatched: tdd-guide owns independent RED for adversarial R1 by executing each vendored helper from its real plugin root and the packaged layout against temporary consumer projects; self repairs production only after the tests land.
  result: A sibling distribution-owned consumer-template module now ships through the support manifest and all three byte-identical plugin trees; isolated vendored helpers plan/apply without borrowing this checkout, while runtime-agent architecture passes 402 assertions.

- item: Migrate the exact v9.17.2 AGENTS-to-CLAUDE pair without retaining duplicate universal authority or copying this repository's own contract into consumers.
  status: done
  dispatched: the same project-instruction tdd-guide freezes adversarial R2 with the exact a503edd8 bytes, consumer-scoped templates, decision-required unknown owner authority, and one-universal-heading postconditions.
  result: Exact a503edd8 AGENTS/CLAUDE hashes have a deterministic one-time migration to the consumer template and thin bridge; unknown Claude authority is decision-required, and no Kaola-Workflow repository-specific contract is copied into a consumer.

- item: Make the Claude @AGENTS.md bridge an owned, mutation-checked invariant while preserving surrounding owner bytes.
  status: done
  dispatched: the same project-instruction tdd-guide freezes adversarial R3 deletion/duplication/alteration fixtures and security R1 byte/mode/symlink fixtures before self changes the migrator.
  result: @AGENTS.md now lives inside the Claude managed envelope; check detects deletion/duplication/alteration without writing, apply restores exactly one bridge, and owner suffix bytes remain identical.

- item: Derive OpenCode reasoning-model assignment only from runtime-neutral intent classes, never Claude render fields.
  status: done
  dispatched: a dedicated tdd-guide freezes adversarial R4 through renderNeutralConfig adapter-isolation mutation coverage and direct intent-source assertions.
  result: reasoningRoles reads behavior-contract intent_class values directly; a valid Claude-only adapter mutation no longer changes the OpenCode roster or config, and the complete OpenCode suite passes 833 assertions.

- item: Preserve instruction owner bytes, restrictive modes, and unproven symlink topology during managed migration.
  status: done
  dispatched: the project-instruction tdd-guide covers invalid UTF-8, 0600 modes, exact outside-byte comparison, symlink refusal, and installed helper layouts for security R1; self owns the buffer-safe atomic implementation.
  result: Managed regions are located and spliced as Buffers, atomic replacements preserve existing modes, and AGENTS/CLAUDE symlinks return decision_required before either peer is written; invalid UTF-8 owner bytes survive exactly.

- item: Protect Kimi and OpenCode user-modified current and retired native profiles with hash-based ownership proof.
  status: done
  dispatched: a dedicated tdd-guide freezes security R2 with post-install owner edits, marker forgery, symlinks, reinstall/uninstall preservation, and exact-known-byte legacy cleanup across project/global paths.
  result: Both runtimes now use filename+SHA manifests for native agents, reject symlink carriers, ignore forged markers, preserve hash-mismatched owner edits, and delete legacy carriers only with manifest or exact known-byte proof; Kimi passes 831 and OpenCode 833 assertions.

- item: Prevent ZCode install/uninstall from enabling, adopting, deleting, or rewriting foreign global hook state.
  status: done
  dispatched: a dedicated tdd-guide freezes security R3 for disabled foreign hooks, path-substring false positives, exact Kaola identity, previous enabled-state restoration, symlink/mode/atomic rollback, and informed refusal before self changes production.
  result: ZCode hook lifecycle now uses an exact state receipt and atomic mode-preserving publication, refuses dormant foreign-hook activation and config symlinks, restores prior enabled state, and leaves ignored configs untouched; the suite passes 844 assertions.

- item: Keep distribution-owned consumer templates from replacing this producer repository's richer AGENTS-first contract.
  status: done
  dispatched: self records and closes the producer/consumer boundary discovered while exercising the exact v9.17.2 migration against the live Kaola-Workflow checkout.
  result: The migration helper recognizes the Kaola-Workflow producer signature and reports producer_repository_preserved, while consumer repositories still receive only the distribution-owned universal template and thin native bridge.

- item: Make OpenCode native-agent ownership preflight complete before any plugin or runtime surface is written.
  status: done
  dispatched: self moves the canonical plugin copy behind the native-agent manifest, symlink, and collision checks while retaining the source-tree self-development behavior, then reruns the complete OpenCode mutation suite.
  result: Agent-directory, legacy-directory, manifest, profile, and hash-collision admission now completes before mkdir or plugin copy; self-development still refreshes its canonical plugin after admission, and the complete OpenCode suite passes 833 assertions.

- item: Migrate the released consumer `KW-CLAUDE-MANAGED` region into the thin `KW-CLAUDE-OVERLAY-MANAGED` bridge without adopting owner bytes.
  status: done
  dispatched: adversarial re-review of frozen candidate 4819957d identified the legacy-marker classification gap; self first adds a failing real consumer fixture, then implements exact owned-region migration and reruns architecture/forge proofs.
  result: The helper recognizes exactly one current-or-released Claude managed envelope, replaces only that region with the canonical thin bridge, preserves exact owner prefix/suffix bytes, and converges on the second apply; architecture passes 422 assertions.

- item: Eliminate the second inline universal AGENTS template from workflow-init so every consumer path renders one distribution-owned wording.
  status: done
  dispatched: adversarial re-review of frozen candidate 4819957d identified divergent 11,496-byte inline and 3,021-byte helper templates; self first freezes one-source reachability, then routes workflow-init exclusively through the shipped helper/template module.
  result: templates/routing/init.skeleton.md no longer carries a universal template envelope or heading copy; all 18 generated workflow-init surfaces name the sole distribution module and writer, while installed-module mutation proves that adjacent module is the live source.

- item: Freeze the two candidate-bound re-review gaps with independent legacy-marker and single-template acceptance.
  status: done
  dispatched: tdd-guide owns RED-only additions to scripts/test-runtime-agent-architecture.js (or the narrow existing validator) and evidence at .cache/rereview-template-gaps-red.md; production, docs, and generated routing surfaces remain outside its custody.
  result: scripts/test-runtime-agent-architecture.js now loads the exact released consumer template, proves old-marker owner-byte migration and second-apply convergence, binds installed helpers to the adjacent module under mutation, and rejects inline universal authoring; frozen 4819957d fails the intended 8 assertions while 414 pass.

- item: Reject Kimi and OpenCode non-regular native agent manifests and same-name profile carriers before any install mutation.
  status: done
  dispatched: ownership-integrity re-review of frozen candidate 4819957d reproduced successful partial installs over directory carriers; a dedicated tdd-guide first freezes directory/FIFO-safe refusal and no-partial-write evidence, then self repairs both installers.
  result: Both installers now classify agent directories, current/legacy manifests, and current profiles as regular-or-missing before writes; directory and FIFO fixtures refuse without blocking or changing any peer runtime surface, with Kimi 848 and OpenCode 866 assertions green.

- item: Preserve OpenCode legacy singular profile symlinks even when their targets are hash-equal to an owned manifest row.
  status: done
  dispatched: ownership-integrity re-review of frozen candidate 4819957d reproduced deletion of a hash-equal symlink during singular migration; a dedicated tdd-guide first freezes the topology case, then self adds link refusal before legacy cleanup.
  result: Install and uninstall cleanup enumerate only regular non-link singular profiles; project/global hash-equal symlinks and their external targets survive while migration completes successfully.

- item: Freeze the Kimi/OpenCode non-regular carrier and legacy-symlink findings with independent installer acceptance.
  status: done
  dispatched: tdd-guide owns RED-only additions to scripts/test-kimi-edition.js and scripts/test-opencode-edition.js plus .cache/rereview-carrier-topology-red.md; production and documentation remain outside its custody.
  result: Real project/global sandboxes now cover manifest directory/FIFO, same-name profile directory, and hash-equal singular symlinks with no-partial-mutation assertions; frozen 4819957d produces 8 intended Kimi and 16 intended OpenCode failures, while already-safe profile-directory cases pass.

- item: Repoint the heavy-reasoning consumer-template model-rendering guard from the retired inline skeleton to the sole distribution module.
  status: done
  dispatched: self performs mechanical test-path maintenance in scripts/test-install-model-rendering.js after the ce2087fe four-chain receipt fails only because the pinned phrase moved with its authority; acceptance wording remains unchanged.
  result: The unchanged heavy-reasoning and naming assertions now read the sole distribution-owned AGENTS template module, the inline skeleton retains only its runtime posture assertion, and the focused model-rendering suite passes.

- item: Distinguish a byte-exact released consumer CLAUDE template from mixed owner content so migration cannot report convergence with duplicate universal authority.
  status: done
  dispatched: tdd-guide independently corrects the released-template acceptance in scripts/test-runtime-agent-architecture.js and records RED at .cache/rereview-r5-authority-red.md; self repairs classification and documentation only after the behavioral failure is frozen.
  result: The exact released consumer pair is now recognized by whole-file SHA and replaced by the canonical AGENTS authority plus thin Claude bridge; an intact legacy region with changed outer bytes returns decision_required with zero writes, and the architecture suite passes 427 assertions.

- item: Refuse non-regular retired OpenCode plural profiles recorded by the previous manifest before any install mutation.
  status: done
  dispatched: tdd-guide independently adds project/global retired-plural symlink and non-regular topology acceptance in scripts/test-opencode-edition.js and records RED at .cache/rereview-r7-retired-plural-red.md; self repairs install-opencode.sh only after the behavioral failure is frozen.
  result: Install admission now inspects every safe manifest basename retired from the current source roster before runtime writes and refuses non-regular carriers; retirement cleanup also excludes symlinks, and the complete OpenCode suite passes 887 assertions.

- item: Retire the remaining walkthrough pin that requires runtime workflow-init surfaces to duplicate the universal First Principles block.
  status: done
  dispatched: tdd-guide independently rewrites only the stale testAxiomBlockByteIdentity acceptance in scripts/simulate-workflow-walkthrough.js and records evidence at .cache/walkthrough-single-authority-acceptance.md; the guard must retain an independent 23-surface width while requiring root AGENTS/README authority and rejecting universal copies in every runtime bridge or init surface.
  result: The mutation-proven guard now requires exactly two authoring surfaces and 21 non-authoring runtime/init surfaces, retains the independent 23-surface census, and the complete 179-scenario walkthrough passes.

- item: Replace the routing-surface validator's retired inline-template landmarks with the executable single-template helper contract.
  status: done
  dispatched: tdd-guide independently updates scripts/test-generate-routing-surfaces.js so all six real init surfaces are pinned to the helper, adjacent template module, AGENTS sole authority, thin bridge, and owner-decision outcomes; evidence lands at .cache/rereview-r8-r9-init-acceptance.md before self changes the skeleton.
  result: The registered validator now pins all six init surfaces to the adjacent distribution module, helper plan/apply/check calls, sole AGENTS authority, thin bridge, and typed ownership outcomes; all 476 routing assertions pass.

- item: Remove contradictory workflow-init directions that still treat CLAUDE.md as the universal section-bearing authority or override helper ownership decisions.
  status: done
  dispatched: the same tdd-guide independently freezes acceptance against required CLAUDE sections, duplicate-authority maintenance actions, and unbalanced intended fence regions in scripts/test-generate-routing-surfaces.js; self repairs only templates/routing/init.skeleton.md and regenerates all six shipped surfaces after RED.
  result: The sole init skeleton now reports AGENTS and bridge helper outcomes, makes no direct instruction-authority edit, and removes both stray fences; six generated surfaces pass mutation-proven authority and CommonMark structure checks.

- item: Route universal mission-list and forge-backlog obligations through the sole consumer AGENTS template instead of requiring every init runtime surface to duplicate them.
  status: done
  dispatched: tdd-guide independently updates scripts/test-route-reachability.js and its obligation authority so derived reachability follows the adjacent consumer-template module while retaining runtime-surface carrier checks; evidence lands at .cache/route-reachability-single-authority-acceptance.md before self changes any production manifest.
  result: Mission-list and forge-backlog obligations now live once in the consumer AGENTS template, all 21 init surfaces reach them only through the helper/module carrier, per-token and per-surface mutations are armed, and route reachability passes 170 assertions.

- item: Audit and dock the final #1033/#1034 documentation against the shipped seven-runtime architecture and aggregate edition-runner behavior.
  status: done
  dispatched: doc-updater independently compares the a503edd8..a89a39f4 changed surface, issue acceptance, README/API/architecture/runtime docs/changelog, and verified CLI/test outputs in the active worktree; it may edit documentation only and records its result at .cache/doc-updater.md.
  result: Documentation review corrected README, API, ADR 0020, and CHANGELOG migration wording, verified all runtime/capability/provenance/edition docs, recorded DOCKED with no implementation blocker, and committed as f7494313.
