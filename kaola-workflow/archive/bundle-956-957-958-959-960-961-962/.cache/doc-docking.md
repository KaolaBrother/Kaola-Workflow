# Documentation docking — bundle-956-957-958-959-960-961-962

**Verdict: DOCKED.**

This bundle is unusual in that documentation *is* the deliverable for five of its seven issues, so
docking is less "did the docs keep up with the code" than "is every claim the docs now make true of
the code". Both were checked, by different parties.

## Changed files reviewed

All 29 files in `902f59a0`. Eight docs (`README.md` under `docs/`, `api.md`, `architecture.md`,
`conventions.md`, `workflow-state-contract.md`, `kimi-edition.md`, `opencode-edition.md`,
`CHANGELOG.md`), two whole-file script deletions, six scripts edited across four trees, five test
files, and one contract validator.

## Documents checked

`README.md` (root), `CHANGELOG.md`, `docs/api.md`, `docs/architecture.md`, `docs/conventions.md`,
`docs/workflow-state-contract.md`, `docs/README.md`, `docs/kimi-edition.md`,
`docs/opencode-edition.md`, and the inline interface comments in `runtime-edition-forge.js`.

## Evidence

Three independent passes, not one:

1. **`review-a-docs.md`** — adversarial, Fable. Every factual claim the diff adds or rewrites,
   verified against the shipped tree. Found one defect (below), fixed. Everything else confirmed
   true, including the parity-guard description, all three `architecture.md` edits, the PR-sink
   sentence, the kimi bullet deletion, the opencode roster pointer, and both original CHANGELOG
   entries fact-checked at HEAD.
2. **`.cache/doc-updater.md`** — the CLAUDE.md checklist, run independently after the fact.
   Verdict PASS on all six items, **zero gaps, zero edits required**.
3. **The finalize four-chain receipt** — green on all four chains at `902f59a0`, with
   `scope.changedFileCount: 29` confirming the chains saw this diff.

## Gaps found and fixed

One, and it was mine. The #957 pointer wording I authored said the Codex per-tier pair is "defined
once" (`api.md`) / "defined solely by" (`conventions.md`) the preflight constants. Measured false:
`install-codex-agent-profiles.js:92-95` independently authors all four constants — which is exactly
what the `validate-kaola-workflow-contracts.js:444-453` cross-bind exists for — and the routing
skeletons author the literals that actually ship. The same sentences credited
`test-route-reachability.js` with binding the SKILL prose, when it binds only the **effort** halves
(its model regex is literally `model: "[^"]+"`).

It also contradicted `docs/architecture.md:396-404`, which a previous bundle's review had already
repaired to say the correct thing — so shipping it would have left two docs disagreeing about one
fact, the precise "one rule, one wording" failure. Both sites were rewritten to mirror
architecture.md's existing wording ("authored twice", naming both authoring sites and the binding's
true shape). Verified afterwards: no values reintroduced, and all three docs now agree.

## No-impact reasons

- **`.env.example`** — does not exist in this repo; no environment surface changed. The one
  environment variable touched by the diff, `KAOLA_TEST_TIMEOUT_SCALE`, had its *reader* left
  deliberately in place (fail-open, now permanently 1) and only its comment corrected, so no
  documented environment contract moved.
- **Roadmap** — `kaola-workflow/ROADMAP.md` is generated, never hand-edited; closure regenerates it
  once from the `.roadmap/issue-*.md` sources.
- **API docs for removed CLI modes** — `--commands-dir` and `--forges` were confirmed undocumented
  in `README.md` and `docs/api.md` before removal (grep exit 1), so their deletion owes no doc edit.
  The `runtime-edition-forge.js` usage string, which *is* the interface documentation for that
  script, was updated in the same change.

## Reported, not acted on

`docs/investigations/*.md` (18 files) and `kaola-workflow/.origin/877/*.md` (6 files) carry roughly
90 further `plan-validator` mentions, all accurate history of the retired DAG executor. They sit
outside the live-doc surface and outside `docs/decisions/**`, which `docs/README.md`'s retention
policy names explicitly. Left untouched. The doc-updater's suggestion — that the retention policy
name these directories too, so a future sweep need not re-derive that they are exempt — is a
reasonable follow-up but is not this bundle's work and was not filed.
