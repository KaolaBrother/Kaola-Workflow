# planner — issue-153 approach analysis (agent a3464f44674e2ace0, model=opus, 2026-05-22)

## TL;DR
Recommend **Approach A**: redirect resolution to read the profile-applied SOURCE
file; inject `inherit` at a single copy-time chokepoint. Smallest pivot,
profile-aware for free, source files stay upstream-faithful, bash 3.2 portable.
JS resolver verified OFF the badge path → no change.

## Verified facts shaping all approaches
- JS resolver `kaola-workflow-resolve-agent-model.js` is OFF the badge path: zero
  command-file references; only callers are its own CLI main() + test-agent-model-resolver.js.
  Command files are pre-rendered with concrete strings at install time by bash. → Q4: no JS change.
- `validate-vendored-agents.js` never inspects the `model:` VALUE (only name/provenance/
  `source-sha256` regex presence at line 63 — does not recompute hash). Source model edits are
  validator-green but diverge from upstream (cost lands on Approach C).
- `source-sha256` is upstream-pinned (commit 922d2d8), not self-referential.
- NO bash-version floor: plain `#!/usr/bin/env bash`, `curl | bash` distribution, macOS bash 3.2
  (no `declare -A`). Hard constraint → kills Approach B.
- `model:` at frontmatter line ~5, before the `---` close and the source-sha256 comment block.
  A rewrite touching only the in-frontmatter `model:` line leaves provenance untouched.

## Approach A — resolve concrete from SOURCE; inject inherit at copy chokepoint (RECOMMENDED)
- `extract_agent_model` already takes a `$agent_file` path arg; only `resolve_agent_model_for_install`
  (line 366: `$AGENTS_DIR/$agent.md`) hardcodes the installed path. Pivot that to the profile-applied
  SOURCE file (reuse higher/common selection at 268–271).
- Introduce one helper `install_managed_agent <source> <dest>` = `cp` + frontmatter `model:`→`inherit`
  rewrite, called at BOTH copy sites (292 managed-update, 301 first-install). Manifest hash at 311
  then runs over the already-rewritten installed file.
- Pros: smallest semantic change; profile-awareness free; source files byte-faithful to upstream
  (validate-vendored-agents/source-sha256 untouched); no declare -A; no separate authority.
- Cons: resolver must replicate higher/common source-selection (small dup of 268–271; mitigate with
  tiny `agent_source_file <agent>` helper); two source reads per agent (negligible).
- Risk: L · Complexity: M (S–M)
- F1: ✓ single `install_managed_agent` at both cp sites, rewrite in-loop BEFORE sha256 at 311 → manifest
  records inherit hash. 2nd run: cmp 281 differs → managed-update branch → recorded==current hash holds
  + marker present → re-copy via helper → re-rewrite → idempotent.
- F2: extend test-install-model-rendering.js to read 9 installed agents and assert `model: inherit`.
- F3: add to validate-workflow-contracts.js a per-command-source check that every `Task(` block
  carries a `model="{..._MODEL}"` line.
- Profile: ✓ free.

## Approach B — capture concrete into in-memory map during copy loop
- Keep source concrete; rewrite installed→inherit during copy; stash concrete (profile-applied) model
  in a side-channel; `model_for_placeholder` reads side-channel not installed file.
- Cons: **bash 3.2 has no associative arrays** → `declare -A` breaks on macOS curl|bash; forces temp-file
  side-channel or parallel indexed arrays — clumsier; resolution authority becomes ephemeral loop state.
- Risk: M (portability footgun) · Complexity: M–L. Strictly more complex than A for no benefit. REJECT.

## Approach C — make source files inherit; move concrete to separate authority
- Rewrite agents/*.md + profiles/higher/*.md source to `model: inherit`; promote default_agent_model
  (or new manifest) to rendering authority.
- Pros: installed==source byte-for-byte; F1 trivially holds.
- Cons: **breaks upstream fidelity** (source model ≠ upstream); **profile representation problem** —
  profiles/higher opus overrides lose their home; higher-vs-common must be re-encoded in a new
  profile-aware authority default_agent_model lacks today. Largest blast radius.
- Risk: M–H · Complexity: L–XL. Profile requirement ✗ at rest. REJECT (biggest reason).

## Recommendation: Approach A
1. Minimal pivot, maximal leverage (extract_agent_model already path-parameterized).
2. Profile mechanism free (reuse 268–271); B/C must re-derive/re-encode.
3. Smallest blast radius on sha256/cmp/manifest/provenance; JS resolver+tests out of scope.
4. Portable (no declare -A kills B; no new authority kills C).

## DO NOT BUILD (hand to Phase 3)
- Do NOT modify agents/*.md or profiles/higher/*.md SOURCE frontmatter `model:` values.
- Do NOT change `source-sha256` or validate-vendored-agents.js.
- Do NOT rewire kaola-workflow-resolve-agent-model.js or test-agent-model-resolver.js (off-path).
- Do NOT touch validate-script-sync.js or scripts↔plugins byte-identity.
- Do NOT touch command-source `model="{TOKEN}"` placeholders or render_command_file substitution.
- Do NOT use `declare -A` (bash4) or `sed -i` without a portability shim.

## Phase 3 MUST encode
- (BLOCKING) F1 manifest ordering: inherit-rewrite MUST run in-loop BEFORE sha256_file at 311. If
  deferred to post-loop, 2nd run sees current_hash != recorded_hash → "user-owned/modified → skip"
  (line 295) → installed frontmatter reverts/stays → badge regresses. Make chokepoint atomic
  (install_managed_agent = cp + rewrite), manifest recording downstream.
- Rewrite mechanism portability: `sed -i` differs BSD(macOS) vs GNU. Use awk→temp→mv (mirrors how
  extract_agent_model parses frontmatter) OR portable two-arg sed. Touch only the `model:` line INSIDE
  frontmatter (between opening --- and its close), never the source-sha256 comment block.
- Drop-guard (F3): under inherit a dropped model= silently runs agent on parent (Opus). The per-Task(
  validate-workflow-contracts.js check guards a future refactor deleting a placeholder line.

## Missing facts (none blocking)
- Open (defer to edit-time): exact awk/sed snippet for in-frontmatter `model:`→`inherit` handling both
  quoted and unquoted forms. Source files use unquoted; snippet should be value-agnostic (replace
  whatever follows `model:` on the first frontmatter `model:` line).
