# #1059 in-scope docs (mission 1)

Reuse: commit `a5c005f5` already retired ADR 0019 §3/§6/§7/§8 escalation-as-current-behavior, plus grok/opencode edition leftovers and the docs/README ADR 0019 blurb.

This round extended that draft against rewritten #1059:

- ADR 0019 §4 note: grok/cursor no-per-call-override rows are capability measurements, not a remaining named escalation divergence.
- §5: scope clamp remains; it is not an auto-escalation trigger and does not restore reviewer→fable re-dispatch.
- Live 8/10/140: `docs/architecture.md`, `docs/agents-source.md`, `docs/runtime-capabilities.md`, `docs/api.md` (including 126-render → 140-render), `docs/conventions.md`. Manifest measured 14 roles, 8 families, 10 variants, 140 profiles. `generate-agent-profiles.js --check` reports the same.
- Historical annotate-not-rewrite: ADR 0020 inventory paragraph; CHANGELOG 10.0.0 #1033 census; CHANGELOG #1018 bounded-fable shipping note.
- Edition leftovers: grok/opencode/cursor `install-all.sh` “seven-runtime sequence” → eight-runtime (ordinals fifth/sixth still match `install-all.sh`).
- CHANGELOG `[Unreleased]` records the retirement and the live-count correction.
- Assertion messages in `scripts/test-runtime-agent-architecture.js` now say eight families (the asserts already compared against the eight-name roster).
- `node scripts/generate-agent-profiles.js --check` exit 0; templates/routing, behavior-contracts, runtime-capabilities, and reviewer bodies contain no restored `escalat` / bounded-fable upgrade clauses.

Not landed (follow-up mission): telemetry retire/redirect, compact dual-load measurement, optional elapsed/tokens, extra cost-language sentence.
