# Phase 2 - Ideation: issue-153

## Approaches Evaluated

### Option A: Resolve concrete from SOURCE; inject `inherit` at copy chokepoint (SELECTED)
- Summary: Pivot `resolve_agent_model_for_install` (install.sh:366) to read the
  profile-applied SOURCE agent file instead of the installed file. Add one helper
  `install_managed_agent <source> <dest>` = `cp` + in-frontmatter `model:`→`inherit`
  rewrite, called at BOTH copy sites (292 managed-update, 301 first-install).
  Manifest sha256 (311) records the already-rewritten installed file.
- Pros: smallest pivot (`extract_agent_model` is already path-parameterized);
  profile-awareness free (reuse higher/common selection at 268–271); source files
  stay byte-faithful to upstream (validate-vendored-agents / source-sha256 untouched);
  bash 3.2 portable; no new authority file; JS resolver out of scope.
- Cons: resolver must reuse the higher/common source-selection (small dup; mitigate
  with `agent_source_file <agent>` helper); two source reads per agent (negligible).
- Risk: Low
- Complexity: Medium (S–M)

### Option B: Capture concrete into in-memory map during copy loop
- Summary: keep source concrete; rewrite installed→inherit during copy; stash each
  agent's concrete (profile-applied) model in a side-channel; `model_for_placeholder`
  reads the side-channel instead of the installed file.
- Pros: single pass; source files stay faithful.
- Cons: **bash 3.2 has no associative arrays** — `declare -A` breaks on macOS default
  bash under `curl | bash`. Forces temp-file side-channel or parallel indexed arrays;
  resolution authority becomes ephemeral loop state (less testable).
- Risk: Medium (portability footgun)
- Complexity: Medium–Large
- Rejected: strictly more complex than A for no benefit; real portability risk.

### Option C: Make source files `model: inherit`; move concrete to a separate authority
- Summary: rewrite agents/*.md + profiles/higher/*.md source to `inherit`; promote
  `default_agent_model` (or new manifest) to the rendering authority.
- Pros: installed == source byte-for-byte; F1 trivially holds.
- Cons: **breaks upstream fidelity** (source model ≠ upstream); **profile
  representation problem** — profiles/higher opus overrides lose their home and the
  higher-vs-common distinction must be re-encoded in a new profile-aware authority
  `default_agent_model` lacks today. Largest blast radius.
- Risk: Medium–High
- Complexity: Large–XL
- Rejected: profile requirement fails at rest; biggest reason to reject.

## Advisor Findings
Advisor APPROVED Approach A (see `.cache/advisor-ideation.md`). A/B/C cover the design
space; no missed alternative. F1 BLOCKING failure mode precisely confirmed: on a 2nd
`install.sh` run, if the rewrite is deferred, `cmp -s` (281) differs → manifest check
(286–298) sees `current_hash != recorded_hash` → "user-owned/modified → skip" branch
(295) → installed frontmatter regresses → badge silently disappears. Make the rewrite
atomic with the copy. Four additions for the Phase 3 write set (one corrected below by
primary-source verification):

1. Script-sync mirroring for the F3 validator edit (CORRECTED scope — see below).
2. F3 drop-guard scope = all three forge validators (forge-agnostic failure mode).
3. Rewrite must preserve the managed marker (`kaola-workflow-managed-agent: true`);
   add a test asserting the marker survives.
4. Pin the rewrite to INSIDE frontmatter (toggle on `/^---$/`); a naive `^model:`
   regex would match prose body lines mentioning `model:`.

## Selected Approach
**Approach A.** Rationale: minimal pivot with maximal leverage; profile mechanism
handled for free; smallest blast radius on sha256/cmp/manifest/provenance; portable
(no `declare -A`); JS resolver verified off the badge path.

### Concrete Phase 3 write set (carries F1/F2/F3 + advisor additions)
- `install.sh`:
  - Add `agent_source_file <agent>` helper centralizing higher/common selection (268–271 logic).
  - Add `install_managed_agent <source> <dest>` = `cp` + awk frontmatter-scoped
    `model:`→`inherit` rewrite (value-agnostic, `/^---$/` toggle, first block only,
    preserve managed marker + source-sha256 + name/description). NO `sed -i`.
  - Call `install_managed_agent` at both copy sites (292, 301); ensure rewrite runs
    in-loop BEFORE `sha256_file` at 311 (F1, BLOCKING ordering).
  - Pivot `resolve_agent_model_for_install` (366) to read `agent_source_file`, not the
    installed file.
- `scripts/test-install-model-rendering.js` (Claude-only — DO NOT mirror): after the
  existing command-file assertions, read the 9 installed `~/.claude/agents/*.md` and
  assert frontmatter `model: inherit` (F2/AC-a) AND that `kaola-workflow-managed-agent: true`
  still present (advisor #3).
- `scripts/validate-workflow-contracts.js` (COMMON_SCRIPT — MUST mirror to
  `plugins/kaola-workflow/scripts/validate-workflow-contracts.js`, byte-identical, same
  commit): add per-`Task(`/command-source check that every dispatch block carries a
  `model="{..._MODEL}"` line (F3 drop-guard).
- `scripts/validate-kaola-workflow-gitlab-contracts.js` and
  `scripts/validate-kaola-workflow-gitea-contracts.js`: add the same drop-guard for
  their plugin command copies (F3 scope = all three forges).

### Verified mirroring scope (primary source: validate-script-sync.js COMMON_SCRIPTS)
- `validate-workflow-contracts.js` IS a COMMON_SCRIPT → F3 edit MUST be mirrored to the
  plugin tree (byte-identical) in the same commit.
- `test-install-model-rendering.js` is NOT a COMMON_SCRIPT and is absent from the plugin
  tree → F2 edit must NOT be mirrored. (Corrects advisor addition #1, which assumed both.)
- `kaola-workflow-resolve-agent-model.js` + `test-agent-model-resolver.js`: NOT edited (off-path).

## Out of Scope (explicit)
- Do NOT modify `agents/*.md` or `agents/profiles/higher/*.md` SOURCE frontmatter `model:` values (rejects C; preserves upstream fidelity).
- Do NOT change `source-sha256` lines or `validate-vendored-agents.js`.
- Do NOT rewire `kaola-workflow-resolve-agent-model.js` or `test-agent-model-resolver.js` (verified off the badge path).
- Do NOT touch `validate-script-sync.js` or the scripts↔plugins byte-identity contract (only ADD a mirrored copy of the F3 edit).
- Do NOT touch command-source `model="{TOKEN}"` placeholders or `render_command_file` substitution.
- Do NOT use `declare -A` (bash 4) or `sed -i` without a portability shim.
- Parallel-dispatch badge visibility (two `Agent` calls in one turn hiding the badge) — separate UI concern, not in scope (issue non-goal).

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| planner | invoked | .cache/planner.md | |
| advisor ideation gate | invoked | .cache/advisor-ideation.md | |
