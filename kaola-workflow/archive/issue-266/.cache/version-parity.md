# version-parity (AC-8) — VERIFICATION-ONLY (no version bump)

non_tdd_reason: This node was frozen to "bump the 3 .codex-plugin manifests + README in lockstep,"
but analysis against the actual release contract shows a version bump is NOT the correct action for
this node, and the node is a deliberate NO-OP (writes nothing to its declared write set).

## Why no bump (evidence-based correction of the architect's D7 assumption)

The architect's version-parity intent assumed AC-8 requires bumping the codex manifests. Two facts
refute that:

1. **AC-8 is FEATURE PARITY, not a version bump.** AC-8: "Parity is maintained across GitHub/Codex,
   GitLab, and Gitea plugin editions where the Codex surfaces exist." The new surfaces (preflight
   4-tree, task-mirror 4-tree base + edition-named gitlab/gitea ports, compact-resume codex/gitlab/gitea)
   ALREADY exist in every edition — delivered by the preflight / task-mirror / compact-hook /
   script-registration nodes and proven green by `npm test` across all 4 editions. Parity is satisfied.

2. **A codex manifest bump REQUIRES a root bump + a new tag — out of this node's write set, and it
   would BREAK npm test.** Per README "Release versioning" (lines ~458-508) and the contract at
   `scripts/validate-workflow-contracts.js` (~395-425): "A Codex manifest bump is a release-surface
   change: it must ride a new root version + tag... The full `npm test` enforces this — it fails when
   a Codex manifest version differs from the value recorded at the `kaola-workflow--v<package.json
   version>` tag." A codex-only bump (3.6.0 → 3.7.0) with root staying 5.6.0 would FAIL npm test. A
   real release needs `package.json` + the gitlab/gitea `.claude-plugin/plugin.json` manifests + a git
   tag — NONE of which are in this node's declared write set (3 codex manifests + README). So "bump"
   was never a valid move for this node.

## Why README needs no content edit

README's script/hook enumeration tables ("Automation scripts", "Installed hooks") are CLAUDE-edition
operational/hook content (the hooks table is explicitly "four Claude Code hooks via install.sh"). The
3 new scripts are CODEX harness internals — documented in `docs/` (architecture.md, api.md) by the
`docs` node, not in the user-facing Claude README. No README content edit is appropriate here.

## Outcome

- NO files written (manifests + README unchanged; parity already holds at codex 3.6.0 / root 5.6.0).
- A node writing fewer files than its declared write set is valid (the per-node barrier checks
  actual ⊆ declared; an empty write set is a subset).
- The version bump + tag + `gh release` is a deliberate, separable RELEASE action (the project uses
  the CHANGELOG `[Unreleased]` section for "done but not shipped"). It is offered to the user as an
  explicit follow-up, not performed autonomously under "finish issue 266."

regression-green: `npm test` is green across all 4 editions at the current (unbumped) state —
confirmed by the `script-registration` node (exit 0, sentinel "Gitea Codex workflow walkthrough
simulation passed") and the `tests` node (exit 0, all 3 Codex walkthrough sentinels). The
version-parity contract (`validate-workflow-contracts.js`) passes precisely BECAUSE no manifest was
bumped — the codex manifests match the value recorded at the current `kaola-workflow--v5.6.0` tag.

FLAG FOR CODE-REVIEW: this node intentionally deviates from the frozen plan's "bump" intent (the
architect's D7 assumption did not account for the release-surface contract). The deviation is the
green-preserving, scope-correct choice; surfaced here for the G1 reviewer.
