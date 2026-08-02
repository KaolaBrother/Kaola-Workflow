# Documentation Docking — bundle-918-919-920-921-922-923

## Verdict: DOCKED

## Changed files reviewed

19 code/test/config files plus 3 documentation files. Grouped by what they oblige:

| group | files | doc obligation |
|---|---|---|
| sink-merge, 4 editions | canonical + Codex mirror + gitlab + gitea | a **removed** user-facing capability (`--branch TBD`) and a removed receipt field |
| claim, 4 editions | canonical + Codex mirror + gitlab + gitea | changed envelope field **semantics** and changed operator-facing messages |
| roadmap generators, 4 editions | canonical + Codex mirror + gitlab + gitea | changed **generated file content** a consumer reads |
| tests | 2 new suites, 3 modified | none directly; registration is the obligation, met in `package.json` |
| `package.json` | 5 chain definitions | none user-facing |

## Documents checked

- **`CHANGELOG.md`** — entries added under `[Unreleased]` in Removed / Fixed / Changed. Every entry
  states the measured fact rather than the intent. Deliberately avoids the failure this project keeps
  hitting, where a summary written from intention overstates the very defect being fixed: the #923
  entry says branchless *was never exercised and had no producer*, which is what was measured, rather
  than claiming it was broken.
- **`docs/api.md`** — the finalize-envelope field table and the edition-caveat paragraphs. Both
  `archive_unstaged` (now edition-scoped, semantics corrected to the measured set) and
  `residue_unstaged` (marked genuinely all-four) updated. The caveat's six-versus-seven counts are
  unchanged because they remain correct; its *reasoning* was rewritten because this bundle's own #922
  fix falsified it mid-run.
- **`kaola-workflow/ROADMAP.md`** — regenerated with the script after the generator changed. Never
  hand-edited. `validate` reported stale → `generate` → `validate` ok.
- **`README.md`** — no impact. It covers overview and install; no install step, command surface or
  supported-forge set changed.
- **`docs/architecture.md`** — no impact. No structural change: the same scripts own the same
  responsibilities, and the four-edition topology is untouched.
- **`docs/workflow-state-contract.md`** — no impact. `branch: TBD` was never a value this contract
  documented as writable; the contract already records the retired-artifact family as never newly
  authored, which is the fact #919 and #923 both leaned on and neither changed.
- **`docs/conventions.md`** — no new rule owed. Both observations this run produced are instances of
  rules already present (*specify the result, never the method*; *find the ancestor sentence first*).
- **`.env.example`** — no impact; no environment variable added, removed or reinterpreted.
- **Issue comments** — closure is carried by the sink.

## Gaps found and fixed

1. **`docs/api.md` edition caveat went stale mid-run.** It explained the missing forge
   `archive_unstaged` by "one unscoped `git add -A`, no `git rm -r --cached`, no candidate-path
   list". #922 gave both forge ports exactly those things, so the explanation became false inside the
   same diff that documented it. Rewritten to the surviving true reason (both forge calls share one
   try/catch). **This is the count-drift shape from the previous bundle repeating in a new place** —
   one issue's fix falsifying another's prose, invisible to every chain — and it was caught by
   reading, not by a gate.
2. **`archive_unstaged` semantics were undocumented as well as unscoped.** The row described the
   field as "paths that did not stage" while the code assigned the *attempted* list. Both the code
   and the row now say the measured thing.

## No-impact reasons recorded

`README.md`, `docs/architecture.md`, `docs/workflow-state-contract.md`, `docs/conventions.md`,
`.env.example` — each with its reason above.

## Anti-fabrication

No structured section was authored from inference. The edition scope in `docs/api.md` is not merely
asserted — it is **pinned behaviourally**: `test-forge-finalize-findings.js` reds if the documented
scope and the ports' actual emissions disagree, and that arm was mutation-proven by falsifying the
docs and observing the red.
