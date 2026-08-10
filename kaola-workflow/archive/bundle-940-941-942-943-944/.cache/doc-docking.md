# Documentation docking — bundle-940-941-942-943-944

**Verdict: DOCKED.**

## Changed files reviewed

38 files, +920 / −510. Four behavioural changes plus one refutation:

- **#940** — floor removal across 4 resolver copies, their tests, 5 validator pins,
  `test-agent-profile-parity.js`, and floor prose in `agents/synthesizer.md`, 3 × `synthesizer.toml`,
  3 × `config/agents.toml`, `docs/conventions.md`.
- **#941** — `scripts/sync-opencode-edition.js` remediation footer; test band A30 in
  `scripts/test-opencode-edition.js` and pin K12 in `scripts/test-kimi-edition.js`.
- **#942** — no code change; refuted by measurement.
- **#943** — `scripts/test-install-model-rendering.js` pin + completeness assertion.
- **#944** — `templates/routing/slots.js`, both skeletons, 6 regenerated Codex SKILL surfaces,
  `scripts/test-route-reachability.js` T19b, `scripts/test-generate-routing-surfaces.js` fixture.

## Documents checked

| Document | Outcome |
|---|---|
| `CHANGELOG.md` | **Updated** — `### Added` (#944), `### Fixed` (#941, #943), `### Removed` (#940). Written before the receipt run. |
| `docs/conventions.md` | **Updated** — kernel named as a render input; role-roster table gains the six generated Codex SKILL surfaces. |
| `docs/decisions/D-687-01.md` | **Updated** — supersession banner on point 6, matching the file's two existing retroactive banners. |
| `docs/decisions/0017-the-mission-list.md` | **Updated** — watch-list row for the missing-`remedy` class. |
| `docs/opencode-edition.md` | **Updated** by `doc-updater` — new subsection documenting what `--check` now tells a user to do, transcribed from four live probe runs. |
| `docs/api.md` | **No impact.** Its row for `sync-opencode-edition.js` (`:1487`) documents neither flags nor output, so #941 did not stale it. Deliberately untouched: it is test-consumed and editing it would stale the green receipt. |
| `README.md` | **No impact, measured.** The `## Workflow roles` tier table and the Codex paragraph remain accurate — no role was re-tiered, and Codex still resolves tiers per spawn. Carries no floor reference. |
| `docs/architecture.md` | **No impact.** No structural change: a slot was added to an existing render path and a dead mechanism removed. |
| `docs/README.md` | **No impact.** No document added or removed. |
| Inline comments | Handled with their code — dangling `DEFAULT_AGENT_MODELS` floor comments trimmed rather than rewritten; the sole surviving record of the resolver's dependency-free constraint was preserved verbatim. |

## Gaps found and fixed

1. `docs/opencode-edition.md` documented `--check` in seven places but not the failure output #941
   changed. Fixed.
2. `docs/decisions/D-687-01.md` point 6 described the retired floor refusals. Fixed with a banner.
3. `docs/conventions.md` did not name the kernel as a render input — the omission that staled the
   sandbox copy list. Fixed.

## Receipt impact — measured, not assumed

`codeTreeHash` recomputed after the `docs/opencode-edition.md` edit:
`1f9961beb81719858800fad1971048bf16044bf978dcdf0af6fd8f08995e4b2a` — identical to the receipt's.
`docs/opencode-edition.md`, `docs/conventions.md` and `docs/decisions/**` are validation-invisible.
`CHANGELOG.md` IS code-visible, but was already in the tree when the chains ran at 21:35.

No `BLOCK:` items.
