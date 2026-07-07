evidence-binding: n1-write-evidence c9688637f178

## task

Node n1-write-evidence (bundle-625-626): two prose-alignment fixes bundled by file-coupling on
`agents/tdd-guide.md`.

- Part A (#625 defect 1, WRITE-role half): the evidence-persistence contract was INVERTED in three
  WRITE-role agent profiles — `agents/implementer.md`, `agents/synthesizer.md`, `agents/tdd-guide.md`
  (plus their `plugins/kaola-workflow{,-gitlab,-gitea}/agents/*.toml` edition twins). They told the
  agent to RETURN its evidence text / "do NOT self-write" `.cache`, the OPPOSITE of the canonical
  contract in `commands/kaola-workflow-plan-run.md` / the codex SKILL ("WRITE-role agents
  (`implementer`, `tdd-guide`) SELF-WRITE their `.cache` evidence, INCLUDING the seeded
  `evidence-binding:` header"). `synthesizer` is confirmed WRITE-role too (`WRITE_ROLES` set in
  `scripts/kaola-workflow-plan-validator.js:168`), so all three needed the same directional fix.
- Part B (#626 defect 2, tdd-guide coverage gate): `agents/tdd-guide.md` mandated an unconditional
  `npm run test:coverage` 80%+ gate that may not exist in every repo. Conditionalized: run a coverage
  command only if the repo exposes one, apply its target where defined; otherwise verify via the
  project's recorded `validation_command`.

## non_tdd_reason

Prose/config alignment across agent-profile `.md` files and their forge-neutral `.toml` twins — no
runtime script behavior changed, and no meaningful failing unit test exists for a directional
wording fix in an agent's instructions. Verified by the change-type-appropriate check for this
category (config/prose alignment): the md↔toml token-parity guard
(`scripts/test-agent-profile-parity.js`), the two forge `--forbidden-only` neutrality scans, and all
four `npm run test:kaola-workflow:{claude,codex,gitlab,gitea}` chains green (the #307 obligation
since the edition trees under `plugins/` were touched).

## verification_tier

regression-green

## write_set (exact match to the declared 12-file write set; `git diff --stat` confirms no other
files touched)

- agents/implementer.md
- agents/synthesizer.md
- agents/tdd-guide.md
- plugins/kaola-workflow/agents/implementer.toml
- plugins/kaola-workflow/agents/synthesizer.toml
- plugins/kaola-workflow/agents/tdd-guide.toml
- plugins/kaola-workflow-gitlab/agents/implementer.toml
- plugins/kaola-workflow-gitlab/agents/synthesizer.toml
- plugins/kaola-workflow-gitlab/agents/tdd-guide.toml
- plugins/kaola-workflow-gitea/agents/implementer.toml
- plugins/kaola-workflow-gitea/agents/synthesizer.toml
- plugins/kaola-workflow-gitea/agents/tdd-guide.toml

(Note: the task mentioned a possible `synthesizor.toml` typo in the gitlab tree needing a rename —
checked; the file was already correctly named `synthesizer.toml` in all three edition trees, so no
rename was needed.)

## verification_commands

1. `node scripts/test-agent-profile-parity.js` -> exit 0, "agent-profile parity tests passed (30
   assertions)" (my Part B edit introduced the literal token `validation_command` into
   `agents/tdd-guide.md`; this curated md->toml feature-token parity guard caught that I had not yet
   mirrored the token into the three `tdd-guide.toml` twins — fixed by adding an equivalent
   conditional-coverage bullet containing the literal token to each twin, re-verified green).
2. `node scripts/validate-workflow-contracts.js` -> exit 0, "Workflow contract validation passed"
   (also caught, and I fixed, a literal-substring pin break: my first rewrite of
   `agents/tdd-guide.md`'s Output Contract section moved a line-wrap so the pinned substring
   "evidence block contains BOTH literal tokens" spanned two lines / broke; re-wrapped so the exact
   substring stays intact, re-verified green).
3. `node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js
   --forbidden-only plugins/kaola-workflow-gitlab/agents/implementer.toml
   plugins/kaola-workflow-gitlab/agents/synthesizer.toml
   plugins/kaola-workflow-gitlab/agents/tdd-guide.toml` -> exit 0, "Kaola-Workflow GitLab
   forbidden-only check passed (3 file(s))"
4. `node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js
   --forbidden-only plugins/kaola-workflow-gitea/agents/implementer.toml
   plugins/kaola-workflow-gitea/agents/synthesizer.toml
   plugins/kaola-workflow-gitea/agents/tdd-guide.toml` -> exit 0, "Kaola-Workflow Gitea
   forbidden-only check passed (3 file(s))"
5. `npm run test:kaola-workflow:claude` -> exit 0, ends "Workflow walkthrough simulation passed" +
   "active-folders-field-parity tests passed (61 assertions)"
6. `npm run test:kaola-workflow:codex` -> exit 0, ends "Kaola-Workflow walkthrough simulation
   passed" + "active-folders-field-parity tests passed (61 assertions)"
7. `npm run test:kaola-workflow:gitlab` -> exit 0, ends "GitLab Codex workflow walkthrough
   simulation passed" + "active-folders-field-parity tests passed (61 assertions)"
8. `npm run test:kaola-workflow:gitea` -> exit 0, ends "Gitea Codex workflow walkthrough simulation
   passed" + "active-folders-field-parity tests passed (61 assertions)"

All four chains were run SEQUENTIALLY (not chained with `&&` alone, each in its own invocation with
its own captured exit code) per the #307 obligation, since this diff touches the edition trees
(`plugins/kaola-workflow-{gitlab,gitea}/` toml twins).

## before_result

Baseline (pre-edit, read-only inspection): `agents/implementer.md`, `agents/synthesizer.md`,
`agents/tdd-guide.md` and their nine `.toml` edition twins all contained "RETURN ... in your final
report" / "Do NOT self-write ... .cache/{node-id}.md — the orchestrator records it parent-side via
record-evidence" framing for these three WRITE-role agents (confirmed inverted vs. the canonical
`commands/kaola-workflow-plan-run.md` contract) — the literal token `evidence-binding` appeared ZERO
times across the three `.md` bodies (confirmed via grep before editing).
`agents/tdd-guide.md` mandated `npm run test:coverage` with "# Required: 80%+ branches, functions,
lines, statements" unconditionally, plus "Ensures 80%+ test coverage" / "Ensure 80%+ test coverage"
/ "Coverage is 80%+" framing elsewhere in the same file, with no repo-coverage-command-exists guard.
`npm run test:kaola-workflow:{claude,codex,gitlab,gitea}` were not run pre-edit as a baseline (this
is a prose-only node with no behavior to regress; the four chains ARE the after-check, and the
files touched carry no runtime logic, so a pre-edit run would exercise byte-identical script code
paths — the standard practice for this non_tdd_reason category is the after-check, which is what
gates this node's close).

## after_result

All 12 declared-write-set files edited (git diff --stat: 12 files changed, 48 insertions(+), 28
deletions(-), no other files touched). Each of `agents/implementer.md`, `agents/synthesizer.md`,
`agents/tdd-guide.md` now literally names `evidence-binding` (implementer.md: 2 occurrences,
synthesizer.md: 1, tdd-guide.md: 1) and instructs the agent to SELF-WRITE its own
`.cache/{node-id}.md`, reading + preserving the seeded `evidence-binding: <node-id> <nonce>` header
verbatim, never altering/stripping it. All 9 `.toml` twins mirror the same directional fix (each
edition triple re-confirmed byte-identical via `shasum` after edits).
`agents/tdd-guide.md`'s coverage gate is now conditional: run a coverage command only if the repo
exposes one (apply its target where defined), otherwise verify via the project's recorded
`validation_command`; the "80%+" unconditional-mandate framing was removed from the frontmatter
description, the "Your Role" bullet, and the Quality Checklist item (each now reads "...where the
project defines one" / "...meets the project's target").
Verification: `test-agent-profile-parity.js` green (30 assertions, up from 27 at HEAD — 3 new
`validation_command` token-parity assertions for the mirrored `tdd-guide.toml` twins),
`validate-workflow-contracts.js` green, both forge `--forbidden-only` scans green, and all four
`npm run test:kaola-workflow:{claude,codex,gitlab,gitea}` chains green (exit 0 each, run
sequentially).

regression-green: all four edition chains (`claude`, `codex`, `gitlab`, `gitea`) ran sequentially
post-edit and each exited 0 with its full walkthrough simulation passing — confirming the prose
changes did not regress any existing behavior/contract across all four editions.
