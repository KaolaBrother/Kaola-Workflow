evidence-binding: n4-finalize f5590649a88e

# n4-finalize — issue-670 sink

## docs_updated
CHANGELOG.md — added one `[Unreleased]` `### Fixed` entry for #670: `locateSection`'s fence detection
now shares the classifier's `^\s{0,3}` raw-line indent anchor (both scan sites), byte-identical across
the four adaptive-schema editions, closing the indented-fence-decoy `plan_hash` wedge; regression T6d
named. Docs/state only — no code writes on the sink.

## no-impact classes
No public interface, env var, CLI flag, API, or architecture changed → no `docs/api.md`, README,
`.env.example`, or ADR update. `classifier.js` (the parity oracle) is untouched.

## four-chain precondition
Cross-edition byte-anchor diff (touches the four `kaola-workflow-adaptive-schema.js` copies incl. the
gitlab/gitea forge trees) → Finalization requires all four `npm run test:kaola-workflow:{claude,codex,gitlab,gitea}`
chains green (byte-identity enforced by `edition-sync.js --check` in the gitlab/gitea chains; the T6d
regression runs in the claude chain), recorded via the run-chains receipt before the sink.

## run gaps
The adversary surfaced two out-of-scope residuals (the plan pre-authorized deferring the heading-match
family). R1 (medium, action=fix) — `locateSection`'s `startsWith` heading match vs the classifier's
anchored regex, a `plan_hash`-wedge-class divergence in a DIFFERENT channel than #670's fence anchor —
filed as follow-up #673 and mapped in `finalization-summary.md` `## Run gaps` as
`manual:locatesection-heading-match-divergence`, `filed: #673`. R2 (CRLF) is NOT a defect (both parsers
are identically CRLF-blind; #670 removed a pre-fix trim CRLF divergence) — recorded in prose, not seeded
as a gap.
