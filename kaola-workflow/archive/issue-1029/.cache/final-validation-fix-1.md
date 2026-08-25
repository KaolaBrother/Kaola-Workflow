# Final-validation oracle repair — AC-7

Baseline HEAD: `89d171ef71c65b5d8841e98c9b48f7e52b10a41a` plus the current 22-file issue-1029
candidate.

## Focused RED

Before editing, the focused install-model test failed on the stale raw-skeleton assertion:

```text
$ node scripts/test-install-model-rendering.js
node:internal/assert/utils:77
    throw err;
    ^

AssertionError [ERR_ASSERTION]: #1018 AC-7: templates/routing/next.skeleton.md dispatch guidance must require each reviewer dispatch to state the review scope / dispatched surface
    at Object.<anonymous> (/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-1029/scripts/test-install-model-rendering.js:93:5)
...
exit code: 1
```

The assertion expected the removed reviewer-only sentence in the raw skeleton. The canonical
reviewer specialization now lives in `SLOTS['main-authored-handoff']` and is consumed by both
skeletons through their slot reference.

## Test-only repair

Changed only:

- `scripts/test-install-model-rendering.js`

The AC-7 oracle now:

- imports the canonical `SLOTS` source;
- asserts `SLOTS['main-authored-handoff']` is a non-empty string carrying the exact reviewer
  specialization: `` `code-reviewer` and `security-reviewer` receive the exact candidate, dispatched
  surface, and acceptance; ``;
- asserts each of `templates/routing/next.skeleton.md` and
  `templates/routing/finalize.skeleton.md` contains exactly one
  `<!-- SLOT:main-authored-handoff -->` reference.

The existing reviewer profile scope-clamp assertions and heavy-tier/carve-out assertions were
left unchanged. No handoff block was copied into the test or skeletons, and no duplicate wording
was introduced.

## Green and exclusion controls

Commands were run from the candidate worktree
`/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-1029`:

```text
$ node scripts/test-install-model-rendering.js
Install model rendering tests passed
exit code: 0

$ node scripts/test-route-reachability.js
Route-reachability test passed (825 assertions).
exit code: 0

$ node scripts/generate-routing-surfaces.js --check
generate-routing-surfaces --check: all 18 surfaces byte-match the skeleton.
exit code: 0

$ git diff --check
exit code: 0
```

The repair diff is limited to `scripts/test-install-model-rendering.js`; production, generated
surfaces, slots, skeletons, profiles, other tests, docs, state, and issue/PR records were not
modified by this repair.
