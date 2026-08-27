# Exact-candidate code review receipt

candidate: 8aebfaa823352320dc3b2e6e32a1a3a7e31ceca8
base: b78d006c28a3849b3bcbceffdd1ebc07f2ef5115
claim: PR #1041 for Issues #1039 and #1037
surface: full candidate, generated-source parity, Cursor installer and doctor, runtime surface facts, active-run instruction adoption, receipts, tests, and documentation

finding: id=R1 scope=in_scope action=fix status=open severity=high fix_role=tdd-guide rationale=global_cursor_hook_can_overwrite_owner_project_profiles

failure_class: destructive ambient project mutation
precondition: A normal Cursor global installation has installed the global sessionStart ensure hook, and a subsequently opened repository contains an owner-authored `.cursor/agents/implementer.md` or another canonical Kaola basename.
input: Start a Cursor session in that repository so the installed `kaola-workflow-ensure-cursor-catalog` wrapper runs.
expected: Global installation remains location-independent; repository materialization occurs only through an explicit target-scoped, collision-safe operation, and unmanaged files are preserved.
observed: The candidate says project catalogs require explicit `--target DIR` at `install-cursor.sh:479`, but then installs support scripts and global hooks at `install-cursor.sh:481-482`. The generated global sessionStart mapping invokes the ensure wrapper, and `scripts/kaola-workflow-ensure-cursor-catalog.js:65-70` copies every existing canonical source over the same project basename without ownership or collision validation.
primary_anchor: install-cursor.sh:479
secondary_anchors: install-cursor.sh:481, install-cursor.sh:482, scripts/sync-cursor-edition.js:272, scripts/sync-cursor-edition.js:368, scripts/kaola-workflow-ensure-cursor-catalog.js:54, scripts/kaola-workflow-ensure-cursor-catalog.js:65, README.md:298, scripts/test-cursor-edition.js:1194
proof: A disposable fixture with a global source `agents/implementer.md` and project contents `owner bytes` returned `status: copied`; the project file changed to the generated implementer profile. The `filesEqual` loop does not guard the file: inequality is the condition that triggers the overwrite. The wrapper suppresses errors, and the new G8 test protects only a differently named `user-owned.md` while never executing the installed sessionStart hook. This can destroy owner-authored project configuration, so the impact is high even though generated parity is green.

finding: id=R2 scope=in_scope action=fix status=open severity=medium fix_role=tdd-guide rationale=execution_default_consent_has_no_reachable_apply_path

failure_class: active-run migration dead end
precondition: An active run has a managed AGENTS region whose candidate replacement is classified as `execution_default_change`, and the user explicitly consents after reviewing the reported old and new hashes.
input: Run the documented helper `apply --project-root <root> --json` after consent.
expected: The consented execution-default migration applies while preserving claim, Mission List, worktree, done results, and live dispatch locators.
observed: `allowWrite` permits active-run writes only for `authority_layout_equivalent` at `scripts/kaola-workflow-project-instructions.js:359-365`; the CLI accepts only plan, check, and apply at `:415-420`, with no consent carrier. Therefore apply returns `decision_required` forever for the consented change. The generated init guidance simultaneously says the change writes nothing until consent or explicit migration, prohibits independent edits, and documents no post-consent operation.
primary_anchor: scripts/kaola-workflow-project-instructions.js:359
secondary_anchors: scripts/kaola-workflow-project-instructions.js:372, scripts/kaola-workflow-project-instructions.js:415, templates/routing/init.skeleton.md:70, templates/routing/init.skeleton.md:103, docs/api.md:51, scripts/test-runtime-agent-architecture.js:880
proof: The candidate test itself drives the pre-consent leg and asserts apply exits 2 with no writes at `scripts/test-runtime-agent-architecture.js:894-907`; it has no second leg that supplies consent and reaches applied. Since neither the helper schema nor the documented invocation has a consent input, existing guards cannot distinguish an unauthorized retry from an authorized one.

finding: id=R3 scope=in_scope action=fix status=open severity=medium fix_role=tdd-guide rationale=cursor_doctor_echoes_static_claims_instead_of_measuring_effective_surface

failure_class: false diagnostic result
precondition: A user invokes `install-cursor.sh --doctor --json --product <value> --host <value>` on an installed Cursor product whose current catalog, build, project mirror, or reload state differs from the checked-in snapshot.
input: Select `app/cloud`, `app/local`, or `cli/local` through the doctor flags.
expected: The doctor identifies the effective product and host without sibling inference, inspects installed scope and project freshness or collision state, reports the live catalog and actual runtime or App build, and names the real reload boundary or capability gap.
observed: `scripts/kaola-workflow-cursor-surface.js:49-76` trusts caller-selected product and host and copies fields from checked-in JSON. It performs no binary, App bundle, filesystem, manifest/hash, project, hook, or live-catalog inspection. For App Cloud it reports the model slug `cursor-grok-4.6-xhigh` as `runtime_build` and derives `catalog_miss` solely from the static `named_catalog` string. It also hard-codes `ambient_repository_write: false` despite R1's installed hook path.
primary_anchor: scripts/kaola-workflow-cursor-surface.js:49
secondary_anchors: scripts/kaola-workflow-cursor-surface.js:61, scripts/kaola-workflow-cursor-surface.js:63, scripts/kaola-workflow-cursor-surface.js:66, scripts/kaola-workflow-cursor-surface.js:72, templates/agents/runtime-capabilities.json:420, scripts/test-cursor-edition.js:1247
proof: On this host, the standalone CLI reports build `2026.08.25-3e8eec8` and Cursor.app reports `3.17.21`, but doctor App-local returns `runtime_build: unknown` because it never inspects the installed App. Its test passes by asserting the same static adapter values, so a stale or false report remains green.

finding: id=R4 scope=in_scope action=fix status=open severity=medium fix_role=investigator rationale=required_cursor_app_and_fresh_cloud_evidence_remains_absent

failure_class: acceptance evidence gap
precondition: PR #1041 is merged with `Fixes #1039` and closes the issue under its latest owner obligations.
input: Evaluate Cursor App local IDE independently and start a fresh App-started Cloud consumer whose project assets existed before boot.
expected: The candidate carries separate live local-App evidence and fresh pre-boot Cloud evidence, including discovery, precedence, catalog, dispatch, tier carrier, reload, commands, and hooks, or it remains open without claiming issue completion.
observed: The checked-in App-local surface is explicitly `unknown` and `unprobed` at `templates/agents/runtime-capabilities.json:395-409`; App Cloud keeps project materialization, injection, reload, and boot-load unknown at `:411-425`. Documentation and the PR explicitly leave both obligations unclaimed while the PR declares `Fixes #1039`.
primary_anchor: templates/agents/runtime-capabilities.json:395
secondary_anchors: templates/agents/runtime-capabilities.json:411, docs/runtime-capabilities.md:245, docs/cursor-edition.md:112, CHANGELOG.md:16
proof: A current local CLI A/B probe was possible and refreshed only the CLI fact: global-only exposed five built-ins and no `implementer`; project-before-boot exposed those five plus all 14 Kaola names. That is not App evidence. The required App UI carrier was unavailable to this review, and no fresh Cloud run receipt exists in the candidate. CLI success and the prior built-in-only Cloud measurement do not satisfy these independent surfaces.

finding: id=R5 scope=in_scope action=fix status=open severity=low fix_role=investigator rationale=unverified_runtime_discovery_is_serialized_as_supported

failure_class: capability overstatement
precondition: A consumer or generated diagnostic trusts the new non-Cursor `install_scope.global_discovery` field to decide that user-global profiles are behaviorally discoverable without project materialization.
input: Read the Kimi install-scope record before a current two-repository live lookup has been performed.
expected: A surface without current behavioral discovery proof remains `unknown`, with a build, host, date, and probe stamp added only after measurement.
observed: `templates/agents/runtime-capabilities.json:287-292` simultaneously records `global_discovery: supported`, `required_project_materialization: no`, and `evidence_status: documented_live_unverified`. The cross-runtime test at `scripts/test-runtime-agent-architecture.js:1440-1447` requires this unsupported conclusion and checks no behavioral lookup, evidence stamp, install root, reload boundary, or two-repository no-write result.
primary_anchor: templates/agents/runtime-capabilities.json:287
secondary_anchors: scripts/test-runtime-agent-architecture.js:1440, docs/runtime-capabilities.md:51
proof: The candidate has no fresh Kimi lookup evidence and labels that absence directly as `documented_live_unverified`; asserting `supported` collapses the issue's required unknown state into a positive capability. The test is a literal schema pin, not a mutation-backed behavioral oracle.

capability_gap: node_repl computer-use carrier unavailable - inspect the Cursor App local IDE catalog without inferring from the standalone CLI

validation: `git diff --check` passed. `generate-routing-surfaces.js --check` reported all 18 surfaces byte-matched. `sync-cursor-edition.js --check` reported 14 agents, 3 commands, and 2 hooks in parity. `validate-script-sync.js` passed all reported parity groups. A current standalone Cursor CLI A/B catalog probe refreshed global-only miss and project-before-boot discovery. Full walkthrough and four producer chains were not run because admitted defects already determine the exact-candidate verdict.
verdict: fail
findings_blocking: 5
review_conclusion: The exact candidate is generated consistently but does not yet satisfy the safe installation, truthful diagnosis, active-run consent, and required live surface evidence contracts.
