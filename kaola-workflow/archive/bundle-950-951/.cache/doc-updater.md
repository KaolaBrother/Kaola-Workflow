# doc-updater report — bundle-950-951 (commit 8b6eeb48)

## Verdict

No documentation change is needed beyond what commit 8b6eeb48 already carries. The CHANGELOG entries
under `[Unreleased]` were already written correctly by the same commit. I made no edits — every
checklist item below is a verified no-impact reason, and the independent sweep for a fourth carrier of
the stale claim found none.

## CLAUDE.md Documentation Update Checklist — item by item

- **`README.md`** — no impact. Read (`README.md:1-15`): overview + the mission-list mechanism, four
  agent runtimes, three forges. Nothing in it discusses `docs/conventions.md`'s worked examples,
  `test-route-reachability.js`'s assertion counts, or the ADR 0017 watch-list. Grepped for
  `test-route-reachability|325|stays green|12.8|18.12|331` — zero matches.
- **API docs (`docs/api.md`)** — no impact. This change touches no CLI surface, no JSON envelope, no
  schema. `docs/api.md` does not mention `test-route-reachability.js`, the worked-example mutation, or
  the opencode `--check` footer line. Grepped — zero matches.
- **`CHANGELOG.md` under `[Unreleased]`** — already done, by the commit under review, not by me. `###
  Fixed` carries the #950 entry (worked-example repoint), `### Added` carries the #951 entry (watch-list
  row). Verified the entries against the actual diff: the #950 entry states the suite now reds at `T19b
  universe: … 6 … found 4` (matches `scripts/test-route-reachability.js` diff), that the counter-example
  moved to `testAxiomBlockByteIdentity` passing at 12→8 (matches `simulate-workflow-walkthrough.js:12024-12027`,
  where `expected = FORGES.length * (2 + runtimeEditionCount)`), and that the plain total is 331 (matches
  a live run of `node scripts/test-route-reachability.js`, below). No correction needed.
- **Architecture docs (`docs/architecture.md`)** — no impact, no structure change. Read the file header
  and confirmed it describes the claim→mission-list→run→finalize→sink shape and durable state; this
  change is prose/comment-only inside an existing convention and an existing ADR watch-list, no new
  component, no new data flow.
- **Inline comments where public interfaces changed** — already done, by the commit under review.
  `scripts/test-route-reachability.js`'s header comment (lines ~756-770) was rescoped from asserting
  "this suite stays green" to "this floor stays green," and now explicitly warns not to widen the claim
  to the whole suite, citing the T19b band that breaks it. No public interface (function signature, CLI
  flag, exported symbol) changed, so no other inline-comment surface is implicated.

## Independent verification of the ground truth the commit's prose depends on

- `node scripts/test-route-reachability.js` → `Route-reachability test passed (331 assertions).` exit 0.
  Confirms the CHANGELOG's "the plain total is indeed 331" and the ADR row's dating is consistent with
  current reality (not something this doc-updater pass needed to change, since the commit already dated
  it `(325→325)` as a historical clause rather than a current one).
- `grep -n "registry derives 18 surfaces" scripts/test-generate-routing-surfaces.js` →
  `test-generate-routing-surfaces.js:239: eq(GENERATED_SURFACES.length, 18, 'registry derives 18 surfaces (3 topics x 6)')`
  — confirms the anchor named in `docs/conventions.md` still exists at that literal.
- `scripts/simulate-workflow-walkthrough.js:11980-12034` (`testAxiomBlockByteIdentity`) — read in full.
  Confirms it is genuinely registry-derived (`expected = routing.FORGES.length * (2 + runtimeEditionCount)`,
  both terms read live off the registry/filesystem, not hand-typed) and its own header comment already
  says the FORGE term "stays green — mutation-proved… caught one guard over, by
  test-generate-routing-surfaces.js's 'registry derives 18 surfaces' assertion" — i.e. the walkthrough's
  own source comment already agreed with the repointed doc before this commit landed, so the repoint is
  not inventing a fact, it is pointing the doc at a place that already stated it.
- `scripts/generate-routing-surfaces.js:134-141` — `FORGES` is derived from `COMMAND_EDITIONS`/`SKILL_EDITIONS`
  (currently 3 forges), so `FORGES.length * (2 + 2 additive runtimes) = 3*4 = 12`, and one forge deleted
  gives `2*4 = 8` — arithmetically matches the "12→8" figure quoted in both `docs/conventions.md` and the
  CHANGELOG entry.

## Independent sweep for a fourth carrier (requested verification)

Grepped every file named in the dispatch — `docs/README.md`, `docs/architecture.md`, `docs/api.md`,
`docs/workflow-state-contract.md`, `docs/opencode-edition.md`, `docs/kimi-edition.md`, `README.md` — for
`test-route-reachability|325|stays green|12.8|18.12|331`.

Result: **no fourth carrier of the stale claim.** The only hits were two unrelated mentions of
`test-route-reachability.js` (`docs/opencode-edition.md:402`, `docs/kimi-edition.md:364`), both reading
"The existing `test-route-reachability.js` / … suites stay green — this edition adds a surface without
altering the others." I read both in context: that sentence is about the **opencode/kimi edition
addition** not perturbing the suite's baseline pass/fail status (an unrelated, still-true claim — verified
live above, 331 assertions, exit 0), not about the forge-deletion mutation scenario `docs/conventions.md`
was illustrating. No edit needed there.

Also grepped `docs/decisions/*.md` broadly for `test-route-reachability` and found many hits, all inside
dated, `Status: **Accepted** — shipped` point-in-time build-decision records (e.g. `D-514-01.md`,
`D-636-01.md`, `D-637-01.md`) that quote the assertion count as it stood on their own date (`146
assertions`, `239`, `283`, etc.). These are historical records by the same convention the commit itself
already applied to the five-defect table row in `docs/conventions.md` (dated `(325→325)` rather than
updated to current) — not living documentation this checklist asks to keep in sync with today's count, so
left untouched.

## Files changed by me

None. Every checklist item above is a verified no-impact reason or already satisfied by commit 8b6eeb48.

## Docking gaps found

None beyond what #951 already recorded in the ADR 0017 watch-list (the opencode `--check` unguarded
source-edit footer), which is explicitly out of scope per the dispatch ("the user ruled that #951 is
recorded, not fixed").
