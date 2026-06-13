evidence-binding: n3-changelog 682d2aeab4d5

## CHANGELOG entry added for issue #449

The `### Fixed` section under `[Unreleased]` in `CHANGELOG.md` was updated to include the #449 entry as the first item in that section.

### Exact text added

```
- **#449** `kaola-workflow-release.js` `isStepDone()` now version-keyed — cutting version B after version A in the same workspace without clearing the receipt no longer short-circuits on A's receipt rows and fabricates `result:ok` (the `version` field is now matched on every receipt lookup; `git_tag` row now stamps `version` too). All four edition release scripts updated.
```

### Location

File: `CHANGELOG.md`
Section: `## [Unreleased]` → `### Fixed`
Position: first bullet under `### Fixed` (inserted before the existing #424 entry)
