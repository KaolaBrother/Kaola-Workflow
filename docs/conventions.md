# Conventions

Document coding style, testing rules, Git practices, naming, and review expectations.

## Release

- Before merging a version bump, create the matching local git tag (`git tag kaola-workflow--v<version> <sha>`); `npm test` enforces the tag exists (unless `KAOLA_WORKFLOW_OFFLINE=1`).
