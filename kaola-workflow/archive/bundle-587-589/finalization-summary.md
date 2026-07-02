# Finalization Summary — bundle-587-589

Bundle run closing **#587** and **#589** all-or-nothing (`closure_policy: all_or_nothing`).
Implementation commit: `1fa76d64 feat: harden freeze-time disjointness proof and adversarial-verifier tie-break (#587, #589)`.

## Delivered

- **#587 — freeze-time disjointness-proof hardening (three blind spots).**
  1. `parallel_allowband_collision` freeze refusal: ≥2 legs of a parallel group (fan-out members
     or independent antichain siblings) each declaring a barrier-invisible allowband docs surface
     (`CHANGELOG.md` / `README.md` / `docs/**`) now refuse at freeze; allowband writes must be
     declared on exactly one leg. Serial-run barrier invisibility deliberately unchanged.
  2. Unconditional cross-node case-fold in `classifier.disjointWriteSets` + the plan-validator
     antichain exact-clobber check, so `Src/x.js` vs `src/x.js` refuse at freeze on a
     case-insensitive FS. `normalizeRepoPath` and the same-node `case_collision` guard NOT folded.
  3. `glob_in_path` freeze-hygiene refusal (`* ? [ ] { }`), so `**/*.md` refuses at freeze
     instead of surfacing late as a runtime `write_set_overflow`.
  Each new refusal carries a typed emit-envelope reason. Decision record: `docs/decisions/D-587-01.md`.
- **#589 — adversarial-verifier majority-refute breaks even-count ties toward refuted.**
  `verifyVerdictBlock` now computes `majorityRefute = refutes * 2 >= verdicts.length` (was `>`),
  so an even-width fan-out's 1-1 split refutes. Odd-width behavior unchanged; typed reason
  (`fanout majority-refute`) unchanged. Decision record: `docs/decisions/D-589-01.md`.
- Cross-edition (#307): plan-validator canonical + codex twin byte-identical, two forge ports
  regenerated, classifier hand-ported to all four editions.

## Final Validation Evidence

Evidence file: `kaola-workflow/bundle-587-589/.cache/chain-receipt.json`.

- All four `npm run test:kaola-workflow:{claude,codex,gitlab,gitea}` chains **exitCode 0**, run
  sequentially, `accepted_red: false` on every chain (no waivers).
  - claude: exitCode 0 (713840 ms), codex: exitCode 0 (19663 ms),
    gitlab: exitCode 0 (240493 ms), gitea: exitCode 0 (236718 ms).
- Receipt `source: npm-default`; `codeTreeHash: 27fba120…` is the authoritative finalize-gate
  freshness pin (plan-validator `--finalize-check` uses codeTreeHash when present; the receipt's
  `headSha: 127b4bac…` is the direct parent of the impl commit `1fa76d64` and is only a legacy
  fallback — committing the impl did not change tree content, so the codeTreeHash matches HEAD).
- Gate authority: `cmdFinalize --finalize-check` (and the `--sink` transaction) verify this
  receipt fail-closed before any irreversible side effect.

## Documentation Docking

**DOCKED.** Documentation updated in n2-docs (doc-updater subagent) — evidence
`kaola-workflow/bundle-587-589/.cache/n2-docs.md`:

- `docs/conventions.md` — new `## Freeze-time write-set hygiene and disjointness (#587)` section.
- `docs/api.md` — `glob_in_path`, `parallel_allowband_collision` refusal sub-bullets, cross-node
  case-fold note, and the #589 `--verdict-check` tie-break note.
- `docs/decisions/D-587-01.md` (new) and `docs/decisions/D-589-01.md` (new).
- `CHANGELOG.md` `[Unreleased]` — #587 under `### Added`, #589 under `### Fixed` (written in
  n4-finalize; evidence `.cache/n4-finalize.md`).

## Required Agent Compliance

| Requirement | Status | Evidence |
| --- | --- | --- |
| Final validation invoked | INVOKED — four-chain receipt fresh + all green | `.cache/chain-receipt.json` |
| Documentation update (doc-updater) | SUBAGENT-INVOKED | `.cache/n2-docs.md` |
| Change-gate review (code-reviewer) | SUBAGENT-INVOKED — `verdict: pass`, `findings_blocking: 0` | `.cache/n3-review.md` |
| Roadmap refresh | INVOKED (via cmdFinalize regen) | `kaola-workflow/ROADMAP.md` |
| Archive | INVOKED (via cmdFinalize) | `kaola-workflow/archive/bundle-587-589/` |
| Final commit | INVOKED | `chore: archive bundle-587-589` + sink transaction |

code-reviewer non-blocking notes recorded verbatim (not resolved by finalization): (LOW, ~unreachable)
classifier coarse arm lowercases `areasB` but `SHARED_INFRA.has` tests original-case `a` —
stricter/safe direction, SHARED_INFRA members canonical-case; (INFO) CHANGELOG deferred to finalize node.

## Run gaps

**none** — gap sweep clean. `kaola-workflow/bundle-587-589/.cache/run-gaps.json` has
`sweptClasses: []` (no repairs, halts, or deferred-red to map).
