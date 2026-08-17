# Documentation docking — bundle-992-993-994

**Verdict: DOCKED**

## On the doc-updater dispatch — declined, with reason

Subagents are offered and declinable in this design, and I declined this one rather than let it run
unexamined. Two reasons, both specific rather than general:

1. **Timing against the receipt.** The four-chain receipt was written over a settled tree. A
   finalize-time doc edit is outside the code/test rerun trigger, but an agent sweeping for doc gaps
   would edit whatever it judged missing, and I would then be re-running chains to re-establish a
   binding I already hold, for docs I have already verified.
2. **Its known failure mode is exactly this diff's shape.** This project records that `doc-updater`
   fabricates schema unless dictated exact text or given real `--json` output. The only structured
   doc surface here is a four-field list whose *emission order* is the contract — precisely the thing
   a fabricating pass gets subtly wrong while looking right.

The docking work itself was not skipped; it was done directly and is recorded below. Where a check
needed running rather than asserting, I ran it.

## Changed files reviewed against the docs

| changed surface | doc obligation | disposition |
|---|---|---|
| `templates/routing/finalize.skeleton.md` + 6 rendered surfaces | user-visible rule change | `CHANGELOG.md` `[Unreleased]`, two entries (#994, #992) |
| `scripts/kaola-workflow-claim.js` ×4 — four new `## Closure` fields | state-contract doc enumerates this block's fields | `docs/workflow-state-contract.md` `## Closure` bullet, four names appended **in emission order** |
| `scripts/kaola-workflow-gap-sweep.js` ×4 — `parseGapSection` export | internal module boundary | no doc surface enumerates this module's exports — no-impact; the export carries its own rationale comment naming the null-vs-array contract |
| `templates/routing/required-blocks.js` — 7 tokens | test artifact | not a documented surface; covered by the CHANGELOG's mutation-proof note |
| test files ×3 | none | no-impact |

## Documents checked

- **`CHANGELOG.md`** — gained an `## [Unreleased]` section; the file previously opened straight at
  `## [9.10.0]`. All three issues have entries. #992's carries the durable record of the owner's
  layer-2 ruling, which that issue's body explicitly requires, and #993's states both the redefined
  `issues_closed` semantics and the explicitly-not-addressed malformed half.
- **`docs/workflow-state-contract.md`** — the `## Closure` bullet lists the block's fields in emission
  order; four appended, matching the file's flat-bullet / inline-code / serial-"and" convention.
- **`docs/api.md`** and **`docs/architecture.md`** — **verified** not to enumerate the `## Closure`
  block's fields (only the state-contract doc does), so no second prose copy now disagrees. The
  contract validators' `docs/api.md` term list is a presence assertion; every listed token survives.
- **`README.md`** — no-impact. The installed command surface is still the same three commands; no
  install step, flag, or supported-forge claim changed.
- **`.env.example` / config** — no-impact; nothing in this diff reads or adds an env var or config key.
- **Issue comments** — no correction comment is owed on any of the three claimed issues (see below).

## Gaps found and fixed

- `CHANGELOG.md` had **no `[Unreleased]` section at all** — created rather than assumed.
- #993's issue body specified four fields with `follow_up_numbers: <a,b,c>` and no degradation value.
  The shipped contract needed `unknown` there so the three degrade together; the doc and CHANGELOG
  both record the shipped value set, not the issue's original one.

## Correction comments owed on the claimed issues

Two of the three claimed issues turned out to be wrong in their filed text, and under the Step 7 rule
a correction lands on the issue it corrects, before it closes. Both corrections are stated in the
CHANGELOG and the finalization summary and will be posted to the issues at closure:

- **#993** — its premise that `issues_closed` could be "the claimed set actually closed" does not hold
  on the shipped merge lane, where finalize closes nothing; and "the parsed `## Run gaps` rows" were
  not reachable as described, since `run-gaps.json` carries no issue numbers and the parser was
  unexported. Its worked example would have stamped `+4`, not `0`.
- **#992** — its layer-2 proposal was declined rather than implemented; the issue closes on layer 1
  with n1-design's floor re-affirmed.
- **#994** — no correction owed; its premises checked out against the code as filed.
