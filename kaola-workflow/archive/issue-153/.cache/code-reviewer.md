# code-reviewer — issue-153 (agent ad6b5b22df30f878f, model=opus, 2026-05-22)

## Verdict: APPROVE. CRITICAL 0 / HIGH 0 / MEDIUM 0 / LOW 1.

Scope verified: changes touch exactly install.sh, scripts/test-install-model-rendering.js, the 4 validators,
plus kaola-workflow/.roadmap/issue-153.md (durable-state artifact). Compliant.

## Correctness (verified empirically by reviewer)
- awk frontmatter rewrite (install.sh:262-276): correctly scoped to first frontmatter block only; tested
  against real agents + synthetic edge cases (indented model:, quoted "sonnet", body prose model:). Preserves
  indent/key prefix via match()+RLENGTH+substr(), replaces only the value. `replaced` flag prevents touching a
  2nd model: line; `closed` flag stops at closing ---. Body prose untouched. All 12 bundled agents use
  single-line `model: X` → rewrite path exercised cleanly.
- Fail-fast (install.sh:275): precedence correct; simulated awk failure takes error path + cleans temp.
  `set -euo pipefail` (line 14) also protects the bare cp at 264. Both call sites (317, 326) are plain
  statements (not subshells) → helper's `exit 1` propagates.
- F1 ordering: install_managed_agent at 317/326 runs BEFORE sha256_file at 336 and marker grep at 330. Correct.
- resolver pivot (install.sh:391): reads SOURCE via agent_source_file → command files still render concrete
  sonnet/opus/haiku. extract_agent_model strips quotes correctly.

## bash 3.2 portability: clean
`bash -n install.sh` passes. No declare -A, no sed -i. mktemp no portability-sensitive args. [[ ]]/local/printf
3.2-safe. [[:space:]] POSIX classes work in BSD/macOS awk.

## F3 guard: verified
assertEveryDispatchHasModel (14 lines). /^Agent\(\s*$/ + /^\)\s*$/ match real dispatch format (Agent( and )
on own lines in phase4/5/6). Discovers real blocks (2/4/3 with subagents — not a no-op). `!hasSubagent ||
hasModel` correct. Identical across all 4 validators.

## Test quality: discriminating
F2 test (test-install-model-rendering.js:67-76) slices to frontmatter via indexOf('\n---',3) before
/\bmodel:\s*inherit\b/ → does NOT match prose model: in bodies. Asserts managed marker survives. npm test
green, walkthrough green, all 4 validators green.

## Findings
- LOW (install.sh:253-260 vs 293-296): agent_source_file() duplicates the inline higher-profile resolution
  in install_agent_files. Both consistent; minor DRY nit, not a defect. Optional: have the loop call
  agent_source_file to dedupe. Skip if preferring loop locality. → LOGGED AS FOLLOW-UP (non-blocking).
- Note (not a finding): awk would orphan a YAML block-scalar `model:\n  sonnet` form, but no bundled agent
  uses it. Mirror validator misresolves paths if run standalone but is byte-identity-checked + never executed
  directly (pre-existing, out of scope). Incidental #152 drift fix confirmed correct (diff -q IDENTICAL,
  validate-script-sync passes).

## APPROVE — no blocking issues.
