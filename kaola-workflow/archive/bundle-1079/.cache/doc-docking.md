# Doc docking — bundle-1079 (issue #1079)

Verdict: DOCKED
Date: 2026-09-20. Candidate: ad5d9e48c80c07afa41dbb19942c09e3f8f616d5.

## Checked files

- `docs/zcode-edition.md` — rewritten around the #1079 native-Skill design: skills tree
  shape, compact recovery via the AGENTS.md managed region + native Skill re-invocation,
  legacy command retirement, installer semantics; historical D2-pinned tokens retained
  (3.10.1, 1M window, self-lock evidence, unknown boundaries).
- `docs/api.md` — compact-lifecycle paragraph names zcode's always-loaded carrier;
  `install-zcode.sh` row documents skills deploy + legacy command retirement (rebase merge
  kept main's sync-row incl. dsh).
- `docs/runtime-capabilities.md` — ZCode compact-recovery row + the 2026-09-19 native-Skill
  measurement added (ZCode 3.12.3 + KPR ACP 0.3.3; KPR #75 AGENTS.md prefix survival).
- `README.md` — delivery table ZCode row now reads Skills.
- `CHANGELOG.md` — `[Unreleased]` entry for #1079 (merged with #1080/#1083 entries at rebase).
- Installer/generator header comments (`install-zcode.sh`, `sync-zcode-edition.js`) updated to
  the skills lane; `--help`/usage text updated.
- Decision record: the run's own `kaola-workflow/bundle-1079/design-freeze.md` is the design
  record; no design change during implementation → no new ADR.

## No-impact reasons

- `docs/architecture.md`: the #1079 change is confined to the additive zcode edition lane
  (sync script + installer + adapter registry entries); the architecture doc names zcode in
  passing and its shape is unchanged — no edit required.
- Root `AGENTS.md` source-layout list: additive edition scripts already covered generically;
  no structural move in this run.
