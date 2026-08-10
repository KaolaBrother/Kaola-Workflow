# Run gaps — manually recorded

The scanner reads `.cache/`; this run's investigation and verification reports live in the run-folder
root, so the gaps they discovered are transcribed here to be swept. Each is a real observation with
its measurement recorded in the named file.

gap: vacuous-assertion — 7 assertions in `scripts/test-generate-routing-surfaces.js` PASS vacuously when the sandbox is dead: a sandbox that cannot start exits 1 for every invocation, indistinguishable from detected drift. Mutation-proved (P2: strip `cmdCheck`'s `process.exit(1)` while leaving DRIFT printing intact → exactly those 7 red, 426 passed). Pre-existing, not introduced or widened by this run; caught in aggregate by the `clean.status` baseline control. Source: `test-944.md`, `verify.md` 944-R1.

gap: dead-code — `{INVESTIGATOR_MODEL}` is a dead placeholder: registered in `install.sh` at both `:544` (`model_for_placeholder()`) and `:576` (the `render_command_file` placeholder list), with zero consuming templates. `git grep -ohP '\{[A-Z_]+_MODEL\}' -- commands/ templates/ skills/` returns only `{TDD_GUIDE_MODEL}`, `{DOC_UPDATER_MODEL}`, `{BUILD_ERROR_RESOLVER_MODEL}`. Source: `premise-943.md`.

gap: dangling-reference — the installed Codex skill `kaola-workflow-next/SKILL.md:251-253` says "The Codex Profile Freshness Gate above is authoritative for profile availability", but no section by that name exists anywhere in that file; `grep -in 'profile freshness'` over all three installed skills returns only that one self-reference. Source: `premise-944.md`.

gap: test-coverage — `A30.SCENARIOS` in `scripts/test-opencode-edition.js` omits the `{WRITE + SOURCE_EDIT}` mixture (a stale generated artifact alongside an unregistered plugin). Driven by hand during verification and the footer is correct, so this is missing coverage rather than a defect. Source: `verify.md` 941-L2.

gap: watch-list — nothing asserts that a `sync-opencode-edition.js` mismatch carries a `remedy`. `remedies` is a `Set` built by `mismatches.map(m => m.remedy)`, so an `undefined` falls out of both branches and the class prints no advice at all, silently reintroducing what #941 closed. Probe-measured on a mirror by adding a fifteenth class; all 14 real classes carry a remedy today, so the arm has no producer. Already recorded as an ADR 0017 watch-list row this run — recorded, not built. Source: `verify.md` 941-L1.
