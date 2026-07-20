evidence-binding: n7-role-agents-trim cb98061ee5a1
<!-- non_tdd_reason: paste non_tdd_reason here -->
non_tdd_reason: scaffolding/boilerplate — narration-only prose trim of hand-maintained agent-profile markdown (no behavioral logic, no runtime code path). The existing validator suites (validate-workflow-contracts.js, validate-vendored-agents.js) are the oracle for the machine-enforced pins; no new failing unit test applies to prose narration.
<!-- regression-green|build-green|smoke-integration -->
regression-green: node scripts/validate-workflow-contracts.js && node scripts/validate-vendored-agents.js green before AND after the edit (verbatim output "Workflow contract validation passed" / "Vendored agent validation passed for 16 agents at 922d2d8f8b64f4e50936e24465cb3bcac81ac0e1"). Chosen over build-green/smoke-integration because these two scripts are the full regression suite governing agent-profile shape/pins for this write set.

## Task

Narration-only Band 3 trim of the eleven hand-maintained role-agent profiles in `agents/`:
build-error-resolver, code-architect, code-explorer, doc-updater, implementer, issue-scout,
knowledge-lookup, metric-optimizer, planner, synthesizer, tdd-guide. Cuts limited to
motivational/explanatory narration and duplicated harness boilerplate, while keeping every
token pinned by `scripts/validate-workflow-contracts.js` / `scripts/validate-vendored-agents.js`,
all YAML frontmatter fields, and all Evidence/Output Contract sections byte-identical.

## Pin survey (done before editing)

- `scripts/validate-workflow-contracts.js`: only two direct file-path pins land in this write set —
  `agents/implementer.md` must include `verification_tier` and `smoke-integration`;
  `agents/tdd-guide.md` must include `evidence block contains BOTH literal tokens`. Both
  sit inside each file's Output Contract section, which was left untouched.
- `scripts/validate-vendored-agents.js`: (a) YAML frontmatter must open at byte 0 and close with
  `\n---\n`, with `name:`/`model:` set — untouched; (b) vendored agents
  (build-error-resolver, code-architect, code-explorer, doc-updater, planner, tdd-guide) must carry
  `upstream:`/`source-commit:`/`source-blob-sha:`/`source-sha256:`/`license:`/`copyright:` fields —
  the wall only regex-validates these fields are well-formed hex/text, it never recomputes a live
  hash of file content, so body edits do not invalidate them; confirmed untouched regardless.
  (c) the "future agent wall" `checkFutureAgentWall`: write-kind agents (tools include Write/Edit)
  must contain `SELF-WRITE` + `evidence-binding`; read-kind agents must contain `RETURN` +
  `record-evidence`. All eleven files' Evidence/Output Contract sections carrying these needles
  were left completely untouched.
- `scripts/validate-kaola-workflow-contracts.js` (codex `.toml` mirrors under
  `plugins/kaola-workflow/agents/*.toml`) was inspected but is NOT part of this node's write set or
  required verification list — the `.toml` files are separately maintained, not generated from
  these `.md` sources by any script this node runs, so no propagation action was needed or taken.
- `ROLE_TOKEN_REGISTRY` in `scripts/kaola-workflow-plan-validator.js` only checks the registry
  array LENGTH (>=2 tokens) per role for the future-agent wall; it does not require the token
  strings to appear literally inside the profile `.md` file, so no additional pins there.

## Cuts made (per file, before -> after line count)

| File | Before | After | Δ | Cuts |
|---|---|---|---|---|
| build-error-resolver.md | 136 | 130 | -6 | (1) opening identity/mission sentence duplicating the frontmatter `description:` field, immediately before "## Core Responsibilities" which restates the same ground in structured form; (2) trailing `---` + "**Remember**: Fix the error, verify the build passes, move on..." motivational aside before "## Evidence Contract" |
| code-architect.md | 93 | 91 | -2 | opening identity sentence duplicating frontmatter `description:`, immediately before "## Process" |
| code-explorer.md | 91 | 89 | -2 | opening identity sentence duplicating frontmatter `description:`, immediately before "## Analysis Process" |
| doc-updater.md | 139 | 133 | -6 | (1) opening identity/mission sentence duplicating frontmatter `description:`, before "## Core Responsibilities"; (2) trailing `---` + "**Remember**: Documentation that doesn't match reality..." aside before "## Evidence Contract" |
| implementer.md | 82 | 80 | -2 | "You are the **implementer**: ..." identity line duplicating frontmatter `description:`, immediately before "## Your Role" which restates the same content with full operational detail |
| issue-scout.md | 196 | 194 | -2 | opening identity/mission sentence duplicating frontmatter `description:` (the "read-only" / "recommend ONE bundle" constraints it restated are independently and more strongly stated in the file's own "## Hard Boundaries" section and JSON schema) |
| knowledge-lookup.md | 92 | 92 | 0 | No cut made. Surveyed the opening paragraph (identity + 3-source enumeration + read-only note) against "## Your Role" and "## Workflow" — it is NOT pure duplicate narration: it is the only place the "local files" source and the explicit "you never edit files" constraint appear, so removing it would be a content loss, not a narration trim. Left verbatim. |
| metric-optimizer.md | 69 | 67 | -2 | "You are the **metric-optimizer**: ..." identity line duplicating frontmatter `description:`, immediately before "## Your Role" |
| planner.md | 234 | 151 | -83 | (1) opening identity sentence duplicating frontmatter `description:`, before "## Your Role"; (2) the entire "## Worked Example: Adding Stripe Subscriptions" section (78 lines) — a fully worked instance of the exact template already defined in "## Plan Format" a few lines above, i.e. duplicated demonstrative boilerplate, not unique instruction; (3) trailing "**Remember**: A great plan is specific, actionable..." aside before "## Evidence Contract" |
| synthesizer.md | 64 | 62 | -2 | "You are the **synthesizer**: ..." identity line duplicating frontmatter `description:`, immediately before "## Your Role" |
| tdd-guide.md | 140 | 138 | -2 | opening identity sentence duplicating frontmatter `description:`, immediately before "## Your Role" |

Total: 1336 -> 1227 lines (-109 lines / -8.2%), matching `git diff --stat` (109 deletions, 0 insertions across the 10 edited files).

## Explicitly declined to cut (recorded per node brief's "if any cut would require narrowing a pin file, do NOT make that cut — record it")

- **"Prompt Defense Baseline" block** (identical ~6-line list in all 11 files): this is a deliberately
  duplicated security control (prompt-injection / data-exfiltration defense), not filler — each
  agent's `.md` is loaded as an independent system prompt with no shared inheritance, so the block
  necessarily repeats per file. Not narration; left untouched everywhere.
- **The `RETURN`/`record-evidence` and `SELF-WRITE`/`evidence-binding` Evidence Contract boilerplate**
  (near-identical sentence, varying only the token name, across all read-kind / write-kind
  profiles): this is the literal needle `validate-vendored-agents.js`'s future-agent wall checks
  per file — cutting it to deduplicate across files would break that check for every touched
  profile. Left untouched everywhere.
- **HTML comment / provenance blocks** (`<!-- kaola-workflow-managed-agent: true ... -->`,
  including the `note:` rationale text in implementer.md, issue-scout.md, metric-optimizer.md,
  synthesizer.md): structurally adjacent to frontmatter, not narrative prose; also plausibly
  provenance-adjacent (CLAUDE.md's "keep provenance out of agent-facing prompts" rule), but
  reclassifying/removing these blocks is a structural change beyond a Band 3 narration trim and was
  not attempted — no write-set gap, just out of this node's declared scope.
- **knowledge-lookup.md**: see table above — surveyed, no safe cut found; left at 0 changes.
- **synthesizer.md `merged_sha` vs. `ROLE_TOKEN_REGISTRY`'s `merge_outcome` token name**: noticed
  a pre-existing naming mismatch between the profile's Output Contract (`merged_sha`) and the
  registry's expected evidence token (`merge_outcome`) while surveying pins. This is a
  pre-existing functional inconsistency, not narration — out of scope for this trim; not touched,
  flagged to the orchestrator/team-lead in the final report instead.

## Verification

Required by node brief, run BEFORE and AFTER all edits:

- `node scripts/validate-workflow-contracts.js`
  - Before: exit 0, "Workflow contract validation passed"
  - After: exit 0, "Workflow contract validation passed"
- `node scripts/validate-vendored-agents.js`
  - Before: exit 0, "Vendored agent validation passed for 16 agents at 922d2d8f8b64f4e50936e24465cb3bcac81ac0e1"
  - After: exit 0, "Vendored agent validation passed for 16 agents at 922d2d8f8b64f4e50936e24465cb3bcac81ac0e1"
- `node scripts/test-opencode-edition.js`
  - Before: exit 1 — `FAIL: H1 (#F3): hookPath resolves a hook via the plugin-sibling ../hooks candidate when the project + config dir have none — got null` (385 passed / 1 failed)
  - After: exit 1 — byte-identical failure line and pass/fail count
  - PRE-EXISTING, unrelated to this node's write set. Root cause: `hooks/kaola-workflow-pre-commit.sh`
    was removed from the repo in a prior commit (`2a48342c "feat: guard dedup — ... advisory hook
    retirement (#725 Phase C)"`), and this test's hook-path-resolution fixture still expects it.
    Reproduced on plain `main` (checked out at `/Users/ylpromax5/Workspace/Kaola-Workflow`,
    unrelated to this leg) with the SAME root cause (there it fails on `A4: .opencode/command/
    count` instead, a difference caused only by differing project/`kaola-workflow/*` state between
    the two checkouts, not by any code difference). `hooks/`, `scripts/sync-opencode-edition.js`,
    `scripts/test-opencode-edition.js` are outside this node's declared write set (only the 11
    `agents/*.md` files) — not fixed here; flagged to the orchestrator.
- `node scripts/test-kimi-edition.js`
  - Before: exit 1 — `Error: ENOENT: no such file or directory, open '.../hooks/kaola-workflow-pre-commit.sh'` at `scripts/sync-kimi-edition.js:538`
  - After: exit 1 — byte-identical stack trace and error
  - PRE-EXISTING, same root cause as above (missing `hooks/kaola-workflow-pre-commit.sh`), reproduced
    identically on plain `main`. Outside this node's write set; not fixed here; flagged to the
    orchestrator.

Additional sanity check (not in the node brief's required list, run for extra confidence):
`node scripts/simulate-workflow-walkthrough.js` — kicked off; this is a long-running full E2E
integration suite and was still running past the 120s foreground timeout at evidence-write time.
It exercises the whole adaptive-node lifecycle end-to-end rather than agent-profile shape
specifically, so it is not gating for this node's narration-only change; the two REQUIRED
validators above (which directly assert against these 11 files) are green before and after.

## Write set

Touched (10 of 11 — knowledge-lookup.md surveyed, no safe cut, left unmodified):
- agents/build-error-resolver.md
- agents/code-architect.md
- agents/code-explorer.md
- agents/doc-updater.md
- agents/implementer.md
- agents/issue-scout.md
- agents/metric-optimizer.md
- agents/planner.md
- agents/synthesizer.md
- agents/tdd-guide.md

No file outside the declared 11-file write set was touched (confirmed via `git status --short`
after edits — only the above 10 files show as modified).
