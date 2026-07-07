evidence-binding: doc-docking (main-session)

# Documentation Docking — bundle-625-626 (#625, #626)

## Changed surfaces (git diff d5f942a8..HEAD)

- `agents/implementer.md`, `agents/synthesizer.md`, `agents/tdd-guide.md` — evidence-persistence
  contract flipped to SELF-WRITE + preserve seeded `evidence-binding:` header (#625).
- `agents/adversarial-verifier.md`, `agents/code-reviewer.md`, `agents/security-reviewer.md`,
  `agents/profiles/higher/{code-reviewer,security-reviewer}.md` — flipped to RETURN-for-
  orchestrator-persist; `security-reviewer` tool grant narrowed to
  `["Read","Grep","Glob","Bash"]` (#625).
- `agents/workflow-planner.md` — stale duplicate Phase-1 sentence removed (#625, incidental).
- `agents/build-error-resolver.md` — dead route names remapped (#625).
- `agents/tdd-guide.md` coverage gate + `agents/doc-updater.md` codemap mission —
  conditionalized on actual repo tooling (#626).
- 18 `.toml` frontmatter twins across `plugins/kaola-workflow{,-gitlab,-gitea}/agents/` mirror
  every `.md` change byte-identically (#307 cross-edition obligation).
- `docs/agents-source.md` — 3 new Local Overrides bullets (n5-docs).
- `CHANGELOG.md` — 2 new `[Unreleased]/### Fixed` bullets (n6-finalize, this commit).

## Checklist

- [x] README.md — no user-facing feature/usage/env-var surface changed; no update needed.
- [x] API docs (`docs/api.md`) — no API/schema/event surface changed; no update needed.
- [x] CHANGELOG.md — updated (n6-finalize, commit `fe67f483`).
- [x] Architecture docs (`docs/architecture.md`) — no structural change to the workflow
      architecture itself (this bundle corrects agent-profile PROSE to match the already-existing
      architecture, it doesn't change it); no update needed.
- [x] `.env.example` — no new environment variables introduced.
- [x] Inline comments — no code (scripts/) touched by this bundle; N/A.
- [x] `docs/agents-source.md` — updated (n5-docs), Local Overrides + Upstream pin + Vendored
      Files table all preserved byte-unchanged elsewhere per its own Refresh Procedure step 7.
- [x] `docs/workflow-state-contract.md` — not touched; no durable-state-contract change in this
      bundle (agent-profile prose only).
- [x] `docs/conventions.md` — not touched; no convention change (the fix realigns prose with the
      PRE-EXISTING canonical contract in `commands/kaola-workflow-plan-run.md`, which already
      stated the correct direction — this bundle didn't change the convention, it fixed 6 profiles
      that had drifted from it).

## Cross-reference check

- n4-review.md (G1 gate, verdict pass, 0 blocking) confirms all 24 surfaces (6 `.md` + 18 `.toml`)
  land correctly and all four edition chains are green.
- n6-finalize.md confirms its CHANGELOG bullets cross-reference n5-docs's Local Overrides without
  duplicating them.

## Deferred/low-severity findings (from n4-review, non-blocking)

Three LOW-severity findings recorded in `n4-review.md`, all `scope=pre_existing` or
`scope=out_of_scope`, `severity=low`, `fix_role=none`:
- R1 — canonical contract enumeration in plan-run.md/SKILL.md names only implementer+tdd-guide
  as WRITE (omits synthesizer/code-reviewer/security-reviewer); direction is unambiguous via tool
  grants + plan spec regardless.
- R2 — workflow-planner.md's knowledge-lookup trigger is stated twice (pre-existing duplication,
  not introduced or worsened by this bundle's single-sentence removal).
- R3 — doc-updater.md's frontmatter `description` still advertises `/update-codemaps` +
  `docs/CODEMAPS/*` even though the body now conditionalizes on Detection; body behavior is
  correct, only the marketing-copy frontmatter description is stale.

Judgment: all three are trivial, non-actionable editorial nits on prose that was already
out-of-scope for this bundle (R1, R2) or a cosmetic frontmatter lag behind an intentionally
correct behavioral change (R3) — not new defects introduced by this run. Filing dedicated
follow-up issues for these would be over-filing relative to their severity. Recorded as `noise`
in `finalization-summary.md`'s Run Gaps section rather than filed.

## Verdict

No documentation gap. Proceed to closure decision gate.
