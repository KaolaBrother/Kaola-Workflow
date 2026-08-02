# Documentation Docking — bundle-911-912-913-914-916-917

Verdict: **DOCKED**

## Why doc-updater was not dispatched

Done inline instead, deliberately. Every doc surface this run touches is API/schema-shaped —
receipt field names, finding-type registries and their counts, a CLI flag's semantics — which is
exactly the class where a delegated doc pass fabricates plausible field names and enum values. The
counts in particular had already drifted once inside this bundle, so the docking needed the
measurement, not a paraphrase. Every number below was read off the code by grep at docking time,
not carried over from a report.

## Changed files reviewed

Product: `kaola-workflow-claim.js` (x4), `kaola-workflow-validation-runner.js` (x4),
`kaola-{gitlab,gitea}-workflow-sink-merge.js`, `kaola-workflow-roadmap.js` (x2),
`templates/routing/slots.js`, `package.json`.
Generated: 6 `workflow-init` renderings, `kaola-workflow/ROADMAP.md`.
Tests: `simulate-workflow-walkthrough.js`, `test-validation-runner.js`, `test-sink-merge.js`,
`test-{gitlab,gitea}-sinks.js`, new `test-forge-finalize-findings.js`.

## Documents checked

| document | outcome |
|---|---|
| `docs/api.md` | UPDATED — see gaps below |
| `docs/conventions.md` | UPDATED — new cross-edition guard documented beside the existing `SHARED_STATE_FIELDS` parity-gate pattern it follows |
| `CHANGELOG.md` | UPDATED — `[Unreleased]`, one entry per issue plus the out-of-bundle fixture fix |
| `README.md` | NO IMPACT — grep for `env-allowlist`, finding types, `archive_unstage`, `roadmap_regenerated`, the cadence sentence and `--plan` returns nothing; README does not describe receipt fields or chain internals |
| `docs/architecture.md` | NO IMPACT — `:353` mentions `--project` / `--plan` only as the diff-scoping inputs to chain selection, which #911 did not change (#911 changed no behaviour at all) |
| `docs/workflow-state-contract.md` | NO IMPACT — already states the retired `workflow-plan.md` artifacts "are read by nothing, and are never newly authored"; this run corroborated that and changed nothing about it |
| `.env.example` | NO IMPACT — no new environment variable ships |
| `kaola-workflow/ROADMAP.md` | UPDATED by regeneration (#917 wording), not by hand |
| issue comments | closure is the sink's job; five follow-ups filed as #918-#922 and one as #923 |

## Gaps found and fixed

1. `docs/api.md` counts said **five vs six**; measured **6/6 forge, 7/7 canonical+codex** after
   #916 added `main_roadmap_mirror_not_regenerated`. Corrected to six vs seven.
2. The same counts were stale in the `CHANGELOG` #914 entry. Corrected.
3. The heading "**The sixth type is not owed**" was itself count-coupled and would rot on the next
   added type. Rewritten to name `archive_unstage_failed` rather than count it.
4. `docs/api.md:340`'s `findings` row enumerates the type names and was MISSING
   `main_roadmap_mirror_not_regenerated` — a user-visible surface #916 introduced.
5. The finalize envelope carried no `roadmap_regenerated_by_root`, so #916's entire point — telling
   a reader WHICH mirror is stale — was undocumented. Added to the JSON shape, with prose for the
   enum, the `skipped` case, `roadmap_regenerated_main_error`, and that the exit stays 0.
6. `--env-allowlist` had a bare usage line and no semantics. Added a subsection stating that an
   allowlisted deterministic key does not take effect, that `env_allowlist_ignored` names it, and
   that the field is outside both digests.
7. `docs/conventions.md` documented the cross-edition parity-gate pattern but not this run's new
   instance of it.

## Deliberately NOT fixed, and why

- `docs/api.md:330` documents `archive_unstaged`, measured 1x canonical / 0x on both forge ports.
  Real defect, filed as **#921** on the owner's ruling rather than folded in — #914's AC-2 is about
  the counts, which are now correct.
- The forge `roadmap.js` ports emit a different `RULES_BLOCK` than canonical (4 bullets vs 5, only
  2 overlapping). Original divergence, filed as **#918**.
