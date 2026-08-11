issue: #961
title: delete: fixtures-orphan-legality.js (102 lines) — a shared anti-drift fixture whose two importers were both deleted
status: open
workflow_project: issue-961
next_step: From the #952 audit (S2). scripts/fixtures-orphan-legality.js, 102 canonical lines, multiplier x1; both importers deleted and all 8 exports unreferenced. Classified delete: rather than yagni: because the capability has no remaining caller at all — not a feature nobody needs yet, but a fixture whose consumers are already gone. Re-run the zero-consumer search in two parts (tracked tree via git grep -P plus an explicit sweep over the six gitignored rendered edition trees) and on the module STEM rather than the basename, since a basename-anchored search produced a false zero elsewhere in this audit. Test custody applies - a test existing only to exercise this fixture is removed with it, never repaired ahead of it.
