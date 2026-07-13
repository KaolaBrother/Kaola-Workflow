evidence-binding: n4-finalize b6aeacfa3b6d

# n4-finalize — issue-673 sink

## docs_updated
CHANGELOG.md — one `[Unreleased]` `### Fixed` entry for #673: `locateSection`'s heading match anchored to
the classifier's `^##\s+<heading>\s*$` opener + `^##\s` terminator, closing the heading channel of the
`plan_hash` wedge (post-#670 sibling). Docs/state only — no code writes on the sink.

## no-impact classes
No public interface, env var, CLI flag, API, or architecture changed → no `docs/api.md`, README,
`.env.example`, or ADR update. `classifier.js` (the parity oracle) is untouched.

## four-chain precondition
Cross-edition byte-anchor diff (the four `kaola-workflow-adaptive-schema.js` copies incl. the gitlab/gitea
trees) → Finalization requires all four `npm run test:kaola-workflow:{claude,codex,gitlab,gitea}` chains
green (byte-identity enforced by `edition-sync.js --check`; the T6e regression runs in the claude chain),
recorded via the run-chains receipt before the sink.

## run gaps
None. n2 review verdict pass 0 blocking; n3 adversary NOT-REFUTED (80,000+ fuzzed heading constructions,
zero divergence). No in-run repair, no deferred/red chain. The adversary's A1 (the pre-existing, DOCUMENTED
ambiguous-channel first-hit behavior at schema.js:1130-1135 — a duplicate heading / unclosed fence makes
the classifier decline as `ambiguous` while `locateSection` returns first-hit) is OUT of the heading-match
channel, inert on frozen plans (a duplicate heading fails validation), and not a new defect — noted in
prose, not a run gap. The gap sweep is empty (`## Run gaps` section omitted).
