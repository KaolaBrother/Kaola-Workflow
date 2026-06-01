# Phase 1 - Research / Discovery: issue-211

## Deliverable
A contract assertion (test) that fails when the `## Delegation Contract` section of the three Codex `kaola-workflow-next/SKILL.md` editions diverges, and that the byte-identical resume clause (`On resume, extract and reassign \`delegation_policy:\` ...`) stays mutually identical. Wired into `npm test`. Must not falsely flag legitimately forge-specific downstream prose.

## Why
Drift prevention / hardening. Today nothing enforces parity of `skills/**/SKILL.md` — `validate-script-sync.js` only byte-syncs files under `scripts/` and the hook copies. A future edit to one forge's Delegation Contract could silently diverge editions and pass every existing validator. Surfaced during #210 where the canonical block was applied by hand to all three editions and verified only manually via `diff`.

## Affected Area
- `scripts/validate-workflow-contracts.js` — the issue's "natural home" (existing cross-forge parity machinery). **Caveat:** in `validate-script-sync.js` COMMON_SCRIPTS (L50), so it is byte-synced to `plugins/kaola-workflow/scripts/validate-workflow-contracts.js` — editing touches the Claude tree; both copies must stay byte-identical.
- ALTERNATIVE: a new standalone `scripts/validate-*.js` wired into the `:claude` test chain (not byte-synced).
- Compared files: `plugins/kaola-workflow{,-gitlab,-gitea}/skills/kaola-workflow-next/SKILL.md`.
- `package.json` test chain (L35–39) for wiring.

## Key Patterns Found
1. Existing cross-forge parity check (plugin.json versions across 3 editions): `scripts/validate-workflow-contracts.js:328-361` — reads all three, asserts each equals the first/baseline. Direct precedent to mirror.
2. Markdown section slicer `sectionBody(content, heading)`: `scripts/kaola-workflow-classifier.js:124-140` — matches `## {heading}`, collects until next `#{1,2}` heading/EOF. Exactly fits extracting the `## Delegation Contract` body (heading L27 → next heading `## Agent Issue Selection` L53 in all three). Not confirmed exported; may re-implement inline (~12 lines).
3. Forge-specific token guard `assertNoForbidden(file)` in `plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js:357-387` region — precedent for excluding forge-specific prose; here the simpler approach is to SCOPE the compare to the shared section so forge prose is never in range.
4. Assert/read helper convention: `read(rel)` + `assert(cond,msg)` (throws → exit 1), fail-fast. `scripts/validate-workflow-contracts.js:9-55`.

## Primary-source verification (this session)
- `## Delegation Contract` section heading at line 27 in all three files; section ends at `## Agent Issue Selection (Required Before Startup)` (line 53). Body extracted via heading-slice = **2440 bytes, byte-identical** across github/gitlab/gitea (`diff` clean).
- Resume clause present in all three: github L220, gitlab L232, gitea L232 (line numbers differ only because forge-specific prose precedes it). The clause is immediately followed by a forge-specific `repair_script=` bash line — so a whole-`## Routing`-section compare would falsely flag; the resume clause must be compared as an isolated line/paragraph, not the enclosing section.
- No current divergence (matches issue's "verified during #210" claim).

## Test Patterns
- Framework: hand-rolled `assert()` (no test framework). Validators throw on first failure → Node exit 1; success prints `'... passed'`.
- Location: `scripts/validate-workflow-contracts.js` (runs in `test:kaola-workflow:claude`, package.json L36, after `test-release-surface-drift.js`, before `test-fast-audit.js`).
- Structure: linear top-level assert calls using `read()`/`assert()` helpers resolving from repo root.

## Config & Env
- `KAOLA_WORKFLOW_OFFLINE=1` gates only the git-tag block in the validator; the SKILL.md parity check is local-file-only (offline-safe, no env needed).
- `validate-script-sync.js` byte-sync constraint applies if `validate-workflow-contracts.js` is chosen as the home.

## External Docs
none — N/A, internal repo conventions sufficient.

## GitHub Issue
KaolaBrother/Kaola-Workflow#211

## Completeness Score
10/10 (goal 3/3, outcome 3/3, scope 2/2, constraints 2/2)

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-explorer | invoked | .cache/code-explorer.md | |
| docs-lookup | N/A | purely internal repo conventions; no external library/API/framework behavior involved | internal patterns sufficient |

## Notes / Future Considerations
- Open DESIGN decision for Phase 2 (advisor to be consulted per goal): (A) add the assertion to `validate-workflow-contracts.js` (reuses machinery, already wired, but touches byte-synced Claude tree → must update Codex copy too) vs (B) standalone `scripts/validate-next-skill-parity.js` wired into the `:claude` chain (no byte-sync coupling, new wiring + new file).
- Whichever home: scope compare to the extracted `## Delegation Contract` section + the isolated resume clause line; never compare whole files or the whole `## Routing` section (forge prose lives there).
- If validator home chosen, decide reuse vs inline-reimplement of `sectionBody` (classifier export not confirmed).
