evidence-binding: n3-validation-runner 7eb9cc90efb9
RED: node scripts/test-validation-runner.js -> exit 1, Error: Cannot find module './kaola-workflow-validation-runner.js' (valid new test, before implementation)
GREEN: node scripts/test-validation-runner.js -> exit 0, test-validation-runner: PASSED
upstream_read: n1-architecture ea05782ab1d5
delegation_outcome: completed

role: tdd-guide
assigned_task: Implement the deterministic validation runner family, focused RED-to-GREEN tests, byte-sync/install registration, and package-chain hook for n3-validation-runner.
write_set_observed: exact assigned product-file set plus this seeded workflow-cache evidence file; n2 profile/generator changes were preserved and not edited.

success_criteria:
- Four role/forge-neutral runner files are byte-identical.
- The child validation environment starts from explicit deterministic/platform-minimum keys and the frozen allowlist only; durable receipts retain only effective-value digests.
- Command identity binds exact command bytes, normalized cwd/policy, effective environment digests, Node/shell/executable realpath-mode-version-output identities, and relevant lock/toolchain identities.
- Validation repetitions and timeouts are bounded; every repetition binds pre/post candidate digests and normalized output/failure signatures.
- Reduction is deterministic: stable all-zero is pass, stable same-signature all-nonzero is fail, and mixed/signal/timeout/mutation/incomparable execution is inconclusive.
- Semantic vector IDs exclude audit time while complete receipt hashes include audit and all durable fields.
- Opt-in local Claude/Codex qualification is process-adapter-mockable, records contract/profile/context identities plus invariant classes/output identities, and never requires equal natural-language findings.
- Single-source support registration, exact four-file create-on-missing/drift detection, and the existing package chain hook are machine tested without changing the outer four-edition order.

tests_changed:
- scripts/test-validation-runner.js (new): canonicalization; policy bounds; env scrub/secret non-leak; closed command heads; identity sensitivity for command/cwd/repetitions/timeout/env/realpath/version/toolchain; output-order/path normalization; exact reductions; audit-independent vector IDs; complete receipt addressing; landable-tree inert/workflow/test-consumed bands; pre/post mutation; mock Claude/Codex qualification; differing prose; fail precedence; safe local invocation posture.
- scripts/test-validate-script-sync.js: exact validation-runner group paths, each-member create-on-missing detection, drift fixture, and live byte parity.
- scripts/test-install-manifest-single-source.js: exactly-once runner registration and physical per-forge source existence.

implementation_files_changed:
- scripts/kaola-workflow-validation-runner.js (new canonical runner and guarded run/qualify-local CLI)
- plugins/kaola-workflow/scripts/kaola-workflow-validation-runner.js (byte-identical copy)
- plugins/kaola-workflow-gitlab/scripts/kaola-workflow-validation-runner.js (byte-identical copy)
- plugins/kaola-workflow-gitea/scripts/kaola-workflow-validation-runner.js (byte-identical copy)
- scripts/validate-script-sync.js (dedicated four-file byte group)
- scripts/kaola-workflow-install-manifest.js (support registration)
- plugins/kaola-workflow/scripts/kaola-workflow-install-manifest.js (byte-identical support registration)
- package.json (focused runner test added to the Claude chain only; outer Claude -> Codex -> GitLab -> Gitea order unchanged)

changed_files:
- scripts/kaola-workflow-validation-runner.js
- plugins/kaola-workflow/scripts/kaola-workflow-validation-runner.js
- plugins/kaola-workflow-gitlab/scripts/kaola-workflow-validation-runner.js
- plugins/kaola-workflow-gitea/scripts/kaola-workflow-validation-runner.js
- scripts/test-validation-runner.js
- scripts/validate-script-sync.js
- scripts/test-validate-script-sync.js
- scripts/kaola-workflow-install-manifest.js
- plugins/kaola-workflow/scripts/kaola-workflow-install-manifest.js
- scripts/test-install-manifest-single-source.js
- package.json

tdd_evidence:
- RED runner contract: node scripts/test-validation-runner.js -> exit 1, MODULE_NOT_FOUND before the runner existed.
- RED byte distribution: node scripts/test-validate-script-sync.js -> exit 1, validation runner dedicated byte group absent.
- RED install registration: node scripts/test-install-manifest-single-source.js -> exit 1, runner registration count 0 for github.
- RED complete receipt address: node scripts/test-validation-runner.js -> exit 1, computeReceiptSha256 absent before the full-receipt self-slot normalization was implemented.
- RED qualification reducer: node scripts/test-validation-runner.js -> exit 1, fail plus later inconclusive incorrectly reduced to inconclusive before fail precedence was fixed.
- RED safe process posture: node scripts/test-validation-runner.js -> exit 1, qualificationInvocation absent before non-persistent/read-only invocations were added.
- GREEN all of the above: node scripts/test-validation-runner.js -> exit 0, test-validation-runner: PASSED.

implementation_notes:
- The runner exports pure canonicalization, command/vector/receipt addressing, landable-tree identity, failure normalization, reduction, and qualification helpers; I/O is behind the guarded CLI or injectable adapters.
- Candidate identity uses a throwaway Git index and excludes active kaola-workflow state plus inert docs while retaining the existing test-consumed prose band; temp indexes are removed and no repository lockfile was created.
- Raw allowlisted values and raw child output are never retained in receipts; only SHA-256 identities are durable.
- Qualification records each runtime independently. Different prose changes output identity but does not change a passing invariant-class result; local process defaults are Claude non-persistent/tool-disabled and Codex ephemeral/read-only.

commands_results:
- node scripts/test-validation-runner.js -> exit 0; test-validation-runner: PASSED
- node scripts/test-validate-script-sync.js -> exit 0; 48 assertions passed
- node scripts/validate-script-sync.js -> exit 0; 24 common scripts, 28 byte-identical groups, 8 normalized families, and 7 export-superset families in sync
- node scripts/test-install-manifest-single-source.js -> exit 0; PASSED
- node --check on the runner and all changed focused JS test/validator/manifest files -> exit 0
- package script assertion -> exit 0; focused runner hook present and exact Claude -> Codex -> GitLab -> Gitea order preserved
- shasum -a 256 on four runner files -> all 31d54c988b567d6ecd580235b057a46b2d24d20860fdd0ef00b8434740647df4
- shasum -a 256 on two install-manifest files -> both 850b2ef22928436e24bb6a2a908821d8485088aba9c9285d6944c801045deb45
- claude --help and codex exec --help -> exit 0; selected non-persistent/read-only qualification flags verified against installed CLIs
- node scripts/kaola-workflow-validation-runner.js --help -> exit 0; run and qualify-local subcommands advertised
- git diff --check -> exit 0

validation_scope: Focused n3 commands only, as directed; the full npm/four-edition chain was intentionally not run in this node and remains the later final-validation responsibility.
failure_classification: none; all final focused behavior and distribution gates are green.

residual_risks:
- Live stochastic Claude/Codex qualification was not invoked in this deterministic implementation node; adapter-driven contract tests cover identity/class reduction, and the opt-in CLI is available for later local qualification without treating prose equality as an oracle.
- The closed shell-command resolver deliberately marks dynamic command heads, shell builtins/keywords, unresolved executables, failed version probes, and ambiguous/incomparable identity as inconclusive; broader shell grammar would require an explicit contract extension.
- Full cross-edition and integration validation is deferred to the frozen downstream validation/finalization nodes by plan design.
