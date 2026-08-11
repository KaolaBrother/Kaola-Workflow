# Documentation docking — bundle-952-953-954-955

## Verdict: DOCKED

## Changed files reviewed (18)

| file | user-visible change | docked where |
|---|---|---|
| `agents/{implementer,code-architect,planner}.md` | new `## Solution ladder`; code-architect's two minimalism bullets removed into it | CHANGELOG `[Unreleased]` |
| `plugins/{kaola-workflow,-gitlab,-gitea}/agents/{3}.toml` (9) | same ladder mirrored to the Codex carriers | CHANGELOG `[Unreleased]` |
| `scripts/test-agent-profile-parity.js` | three new `ROLE_PINS` entries | CHANGELOG `[Unreleased]`; the mechanism itself is described generically at `docs/conventions.md:344-348`, which does not enumerate pins and is therefore not staled |
| `docs/decisions/0017-the-mission-list.md` | two new watch-list rows | CHANGELOG `[Unreleased]`; the ADR is itself the register of record |
| `docs/architecture.md` | new `### Runtime capability divergence`; `§ Model resolution` repointed | CHANGELOG `[Unreleased]`; indexed from `docs/README.md` |
| `docs/README.md` | sub-pointer to the new subsection | self-docking |
| `docs/audits/2026-08-11-subtraction-audit.md` | NEW — the #952 deliverable | CHANGELOG `[Unreleased]` |
| `CHANGELOG.md` | `[Unreleased]` created (none existed; top was `[9.6.0]`) | self |

## Documents checked

`README.md` · `docs/api.md` · `docs/architecture.md` · `docs/README.md` · `docs/conventions.md` ·
`CHANGELOG.md` · `docs/decisions/0017-the-mission-list.md` · the roadmap · issue comments.

## No-impact reasons, each verified rather than assumed

- **`README.md` — no impact.** Grepped for every term this bundle could touch (`minimalism`,
  `simplest architecture`, `reuse or extend`, `ladder`, `ROLE_PINS`, `watch list`): zero hits. Its
  `## Workflow roles` table carries `Agent | Role kind | Tier` only, none of which changed. The
  installed command surface (three commands) and the install paths are untouched.
- **`docs/api.md` — no impact, and deliberately NOT edited.** All 60 section headings enumerated;
  none documents agent prompt content, the `ROLE_PINS` mechanism, or the ADR 0017 watch list. Its one
  `implementer/code-architect/planner` hit concerns a retired attestation field, unrelated.
  **This mattered operationally**: `docs/api.md` is test-consumed, so an edit here would have staled
  the four-chain receipt produced in Step 1 and forced a full re-run.
- **`docs/conventions.md` `ROLE_PINS` prose — not staled.** It describes the mechanism and its
  rationale without enumerating current pins, so three new pins do not contradict it. Its "Aiming a
  guard" row cites the consensus threshold for the *test-custody* example (2 of 11), a different rule
  from this run's ladder pins (3 of 11).

## Gaps found and fixed

None found at docking. Every gap this run surfaced was found earlier, by adversarial review, and
fixed before this point — six defects across #954 and #955, listed in the summary.

## Deliberately NOT docked, and why

`docs/audits/2026-08-11-subtraction-audit.md` names two live stale lines — `docs/README.md`'s
opencode index line and `docs/conventions.md`'s `FEATURE_TOKENS` paragraph. They are **left in
place**. #952 is report-only by its own terms; repairing findings inside the run that reports them
would collapse the distinction the issue is built on. Both escalate: #962 and #956.
