# Documentation docking — bundle-945-946-947-948

Verdict: **DOCKED**

## Changed files reviewed

`install.sh`, `templates/routing/next.skeleton.md`, the three regenerated
`plugins/*/skills/kaola-workflow-next/SKILL.md`, `scripts/test-route-reachability.js`,
`scripts/test-generate-routing-surfaces.js`, `scripts/test-opencode-edition.js`, `CHANGELOG.md`.

## Documents checked

`README.md`, `docs/README.md`, `docs/api.md`, `docs/architecture.md`, `docs/conventions.md`,
`docs/workflow-state-contract.md`, `docs/opencode-edition.md`, `docs/kimi-edition.md`,
`docs/agents-source.md`, `.env.example`, plus the sanctioned historical trees
(`docs/decisions/`, `docs/investigations/`, `docs/audits/`).

## Gaps found and fixed

`CHANGELOG.md` under `[Unreleased]` — the one docking obligation this diff carried. Written **before**
the chain receipt run, so the receipt is not staled by a finalize-time doc edit. #948 under `Added`;
#947 (the dangling pointer) and #947 (the case-blind guard) and #945 under `Fixed`; #946 under
`Removed`.

## No-impact reasons, per document

- `README.md` — no update owed *by this diff*. Test-consumed (`SELF_HOST_TEST_CONSUMED`), so
  deliberately not edited. The role/tier roster at `:209-215` remains accurate: no role was added,
  retired or re-tiered by #946.
- `docs/api.md` — no signature or behaviour in this diff is documented there. Test-consumed; a
  needless edit stales the receipt. Not edited.
- `docs/architecture.md` — structure unchanged. The Codex profile-readiness paragraph (`:319-322`)
  already describes install-time verification, which is exactly what #947's retirement leaves true.
- `docs/conventions.md` — the routing-generation rule (`:136`, edit the skeleton and regenerate) and
  the Codex readiness boundary (`:54-59`) both stay true and were followed by #947.
- `docs/workflow-state-contract.md` — nothing in this diff touches durable state, the roadmap mirror,
  claim records or issue-source fields. Test-consumed; not edited.
- `docs/opencode-edition.md` — #948's new scenario is a composition of behaviour already documented by
  the remedy derivation at `:337-355`; it adds coverage for documented behaviour rather than new
  behaviour.
- `docs/kimi-edition.md` — its placeholder references describe the kimi *transform* (Claude
  `model="{...}"` rewritten to inherit-prose, and the residue check asserting no `{X_MODEL}`
  survives). Removing eight registrations that no surface spelled changes neither that transform's
  input nor its output.
- `docs/agents-source.md` — vendored-agent provenance only; no role was added, retired or re-tiered.
  Test-consumed; not edited.
- `.env.example` — contains no model, placeholder or agent key.
- `docs/decisions/`, `docs/investigations/`, `docs/audits/` — sanctioned historical residue per
  `docs/README.md:26-42`. `D-646-01.md` and several investigations reference `model_for_placeholder`
  and the `placeholders` array; these are dated records of decisions as taken, left as-is by the same
  precedent that left the retired `--profile` axis named in them.

## Inaccuracies found but deliberately not landed here

Three pre-existing doc defects were found while checking. None was created by this diff; all three
are filed rather than fixed, because #949's surface is test-consumed and fixing it would stale the
in-flight receipt for a defect that predates the run.

- #949 — `docs/architecture.md:341-343` and `README.md:201-207` claim the model badge renders on every
  subagent dispatch; measured, three dispatches in the tree carry a placeholder, all in
  `commands/kaola-workflow-finalize.md`.
- #950 — `docs/conventions.md:325` cites 325 assertions for `test-route-reachability.js`; measured 331
  on the branch and on the pre-bundle base alike.
- #951 — A30's blind spot to a dropped source-edit footer line.

No `BLOCK:` items; nothing needed was unverifiable.
