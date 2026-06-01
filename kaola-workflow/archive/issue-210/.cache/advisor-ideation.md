# Advisor — Ideation Gate (issue-210)

Design endorsed as sound and complete against the AC. Two earlier judgment calls
confirmed correct: (a) surfacing the codex-version/root-tag conflict to the user;
(b) overriding the planner's "one validator / one walkthrough" claim with
primary-source reads. The plugin-dir forge validators (gitlab L213–324, gitea
L220–331) and the 3 Codex walkthroughs are real → mirror the new tests to all
three forges. No blocker; proceed to implement.

## Risk is purely mechanical (byte-exact string matching). Pre-flight checklist:

1. **Grep every sentinel in every target file** (`grep -F`) after editing prose +
   validators — confirm each `assertIncludes` present / each `assertNotIncludes`
   absent. A single backtick/wording drift is the only realistic break. Sentinels
   kept on single lines (good); the grep is the proof.
2. **Diff the rewritten Delegation Contract block across the 3 SKILLs** —
   byte-identity is convention, not enforced (`validate-script-sync` covers
   `scripts/`+hooks, never `skills/`):
   `diff <(awk 'NR>=27&&NR<=55' gh) <(... gl)` and `... ge`.
3. **Match each validator's idiom** — github has `assertIncludes`/`assertNotIncludes`
   helpers; gitlab/gitea use `assert(!read(file).includes(needle))` and the
   `delegationNegativeChecks` array. Extend the array / raw `assert(...)` in those
   two; the helper is github-only.
4. **Preserved tokens differ per forge** — github next SKILL must retain ALL three
   status tokens (asserted L155–157); gitlab/gitea loops only assert
   `subagent-invoked` (gitlab L240, gitea L247). All three: the resume-reference
   first line stays verbatim (github L224, gitlab/gitea L236); edit only the
   "if it is absent…" tail.
5. **README: stay in the delegation paragraph (L373–378).** The Claude validator
   asserts the version-row strings at L403–408 (`Codex `kaola-workflow` plugin
   manifest: `1.8.2``) — do not perturb those.

## Final gate — both must hold (they check different things):
- Full `npm test` green (all 4 suites) → proves nothing broke.
- `git diff --name-only main` lists ONLY: 3 next SKILLs, 3 Codex validators,
  README.md, docs/workflow-state-contract.md, CHANGELOG.md, .roadmap/issue-210.md,
  and kaola-workflow/issue-210/ artifacts → proves nothing was *touched*. If
  package.json, any commands/, or a byte-synced script appears, STOP.

## Note
The `.codex/agents/kaola-workflow/` path-coupling (prose pins an install detail)
is a minor maintenance tradeoff, not a correctness issue — it is exactly what the
issue asked for. Optional follow-up; do not act on it here.

Order: write prose first, then lift sentinels verbatim into validators. The
`assertNotIncludes` guards go RED now (the prompt strings exist today) → TDD signal.
