evidence-binding: n3-rubric 0c12a9de98f1
<!-- non_tdd_reason: paste non_tdd_reason here -->
non_tdd_reason: agent-profile documentation carried in code-classified .toml mirrors plus a token-presence parity guard — no behavioral unit under test.
<!-- regression-green|build-green|smoke-integration -->
verification_tier: build-green

## Task

Update the planner's "Speculative-open-eligible shaping" authoring rubric in
`agents/workflow-planner.md` (stale since the #596-class leg-contained write-speculation half
shipped in commit `5ba860b2`), mirror it byte-identically into the three `workflow-planner.toml`
twins, and keep `scripts/test-agent-profile-parity.js` FEATURE_TOKENS enforcing md↔toml parity on
the new prose.

## Rubric change summary

Read the shipped engine as ground truth before writing prose (`scripts/kaola-workflow-next-action.js`
`speculativePending` eligibility loop, `scripts/kaola-workflow-adaptive-node.js`
`selectSpeculativeWriteGroup` / discard-speculative DISCARD-ONLY write teardown, and
`scripts/kaola-workflow-adaptive-schema.js` `SPECULATIVE_OPEN_POLICY_DEFAULT = 'auto'`).

Rewrote the rubric section (agents/workflow-planner.md, was "speculative open is NEVER permitted for
a write node"; now):
- A candidate node — read OR write — is speculative-eligible when (a) its ONLY unsatisfied dependency
  is a single in-progress gate-verdict-role node, (b) that gate is high-probability-pass, and
  (c) — write-bearing only — the declared write set is EXACTLY resolvable (no dir/glob token), carries
  NO PROTECTED file (e.g. CHANGELOG.md — keep such a file on a downstream/sink node), and the node is
  not the plan's unique sink. A read-only node trivially satisfies (c).
- Added a "Shape topology to EXPOSE this" paragraph: under the `auto` default, author independent
  post-gate work (a docs/ADR node, a small disjoint writer) so its only unsatisfied dependency is a
  high-probability-pass gate; eligibility itself stays mechanical/validator-derived (no new plan
  keyword) — `consent` remains authorable for a run that wants the per-open ask; `off` disables
  speculation entirely.
- Added a "Keep-or-discard asymmetry" paragraph: a speculative READ node's evidence may still be valid
  on a gate fail (operator KEEPs or discards); a speculative WRITE node is DISCARD-ONLY — its leg and
  evidence are torn down unconditionally.
- Kept the pinned substring `unsatisfied predecessor is a high-probability-pass gate` verbatim in the
  closing "Rule of thumb" sentence (generalized from "a read-only node's" to "a node's" without
  breaking the substring).
- Provenance-free (no #NNN / D-NNN-NN) and forge-neutral throughout — verified with the
  PROVENANCE_BAN regex directly against the changed line (zero matches) and via all four
  `validate-*-contracts.js` runs (below).

Mirrored the rewritten paragraph byte-identically (flattened to the toml's established single-line
`developer_instructions` style — headings de-bolded to an ALL-CAPS label, backticks/italics stripped,
bullet markers folded to inline `(a)/(b)/(c)` clauses, same as the surrounding paragraphs) into:
- plugins/kaola-workflow/agents/workflow-planner.toml (line 24)
- plugins/kaola-workflow-gitlab/agents/workflow-planner.toml (line 24)
- plugins/kaola-workflow-gitea/agents/workflow-planner.toml (line 24)
Confirmed byte-identical via `sed -n '24p' <file> | md5` on all three — identical digest
`8fdea5c7b6183551980e4f606ecf762d`.

## FEATURE_TOKENS update (scripts/test-agent-profile-parity.js)

- Kept the existing pinned token `'unsatisfied predecessor is a high-probability-pass gate'` unchanged
  (refreshed only its explanatory comment to note write eligibility, per task instructions — the token
  string itself is untouched).
- Added a new token `'DISCARD-ONLY'` (present in the new write-speculation paragraph in both the .md
  and all three .toml twins) so md↔toml parity is enforced on the new write-eligibility prose.

## Verification (change-type-appropriate: build-green — doc/prompt-surface + parity-guard change,
no behavioral unit)

Before (baseline, HEAD `5ba860b2`, section unedited — re-verified via `git stash` / run / `git stash pop`
rather than assumed):
- `node scripts/test-agent-profile-parity.js` — pre-existing baseline passed (24 assertions, old
  token set), exit 0.

After (leg HEAD, all 5 declared files edited):
```
$ node scripts/test-agent-profile-parity.js
agent-profile parity tests passed (27 assertions)
exit 0

$ node scripts/validate-workflow-contracts.js
Workflow contract validation passed
exit 0

$ node scripts/validate-kaola-workflow-contracts.js
Kaola-Workflow Codex contract validation passed
exit 0

$ node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js
Kaola-Workflow GitLab contract validation passed
exit 0

$ node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js
Kaola-Workflow Gitea contract validation passed
exit 0
```

`git status --porcelain` in the leg shows exactly the 5 declared files, nothing else:
```
 M agents/workflow-planner.md
 M plugins/kaola-workflow-gitea/agents/workflow-planner.toml
 M plugins/kaola-workflow-gitlab/agents/workflow-planner.toml
 M plugins/kaola-workflow/agents/workflow-planner.toml
 M scripts/test-agent-profile-parity.js
```

## Leg containment

All Edits used absolute paths under
`/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/legs/issue-597/n3-rubric`; all Bash commands were
prefixed `cd "<that leg path>" && `. No write touched the parent worktree or main repo except this
evidence file, written to the permitted parent path
`/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-597/kaola-workflow/issue-597/.cache/n3-rubric.md`.
The evidence-binding header line (nonce `0c12a9de98f1`) is unmodified.

## Deviations

None — the write set matches the frozen plan's declared 5 files exactly; no additional files were
touched.
