# Planner Output — issue-118

## Approach A: Minimal direct edits
Make exactly the four edits to `uninstall.sh` listed in Phase 1, add the README line, and append a single `assertIncludes` check for `kaola-workflow-gitea` to the Gitea contract validator.

- Pros: Smallest diff; mirrors gitlab block exactly; easy to review.
- Cons: Single string assertion doesn't catch partial implementations (e.g., directory block added but case validation forgotten).
- Risk: Low.
- Complexity: S.

## Approach B: Refactor uninstall.sh to a forge-list loop
Replace per-forge `if` blocks with a data-driven associative array and loop.

- Pros: Future forge additions are one-line table additions; validation/removal lists can't drift.
- Cons: Bash associative arrays require bash 4+; macOS default is bash 3.2. Scope creep beyond issue deliverable. Creates asymmetry with `install.sh` which also uses per-forge `if` blocks.
- Risk: Medium (portability risk).
- Complexity: Medium.
- **Rejected.**

## Approach C: Minimal edits + stronger contract coverage (Recommended)
Approach A plus extend the Gitea contract validator with 4 targeted assertions on `uninstall.sh`:
1. Usage string contains `gitea`.
2. Two-arg error message contains `gitea`.
3. `case "$FORGE"` line contains `github|gitlab|gitea|all`.
4. A line matching `"$FORGE" = "gitea"` exists (the forge branch).
5. `kaola-workflow-gitea` directory referenced.

- Pros: Catches partial implementations; documents four-spot contract; same style as existing validator.
- Cons: Validator gets 4 assertions instead of 1 (minor).
- Risk: Low.
- Complexity: S.

## Recommendation: Approach C

The four targeted validator assertions close the gap where a partial implementation (e.g., `remove_dir` block added but `case` validation forgotten) would pass a single string check. Mirrors the existing `installScript.includes(...)` contract style.

## Suggested Validator Assertions

```js
const uninstallScript = read('uninstall.sh');
assert(uninstallScript.includes('github|gitlab|gitea|all'), 'uninstall.sh must accept --forge=gitea in case validation');
assert(uninstallScript.includes('"$FORGE" = "gitea"'), 'uninstall.sh must branch on gitea forge selection');
assert(uninstallScript.includes('kaola-workflow-gitea'), 'uninstall.sh must remove the Gitea install directory');
assert(/Usage:.*gitea/.test(uninstallScript), 'uninstall.sh usage string must list gitea');
```

## Explicit NON-goals
- Do not refactor `uninstall.sh` to a data-driven forge table.
- Do not touch the hook-stripping Python3 block (forge-agnostic by design).
- Do not add `--forge=all-incl-legacy` or change `all` semantics beyond the new gitea block.
- Do not extend contract validators for github/gitlab uninstall coverage.
- Do not add a new walkthrough simulation case for uninstall.
- Do not add CHANGELOG entry unless AC explicitly requires it.

## Missing Facts That Could Change Decision
1. Does issue #118 AC mention CHANGELOG? (Low impact either way.)
2. Are there other validate-*-contracts.js files that assert uninstall.sh? (Would inform assertion style.)
3. Does install.sh install Gitea files anywhere other than `$HOME/.claude/kaola-workflow-gitea`? (If yes, uninstall needs extra removal.)
4. Does `remove_dir` automatically increment the `removed` counter? (Affects whether any extra plumbing is needed.)
