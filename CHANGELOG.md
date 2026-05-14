# Changelog

## Unreleased

No unreleased changes.

## Codex plugin 1.1.1 - 2026-05-14

### Changed

- Raised the Codex `planner` role to `xhigh` reasoning effort to match the
  Claude Code Opus-backed planner role.
- Documented that Codex role profiles do not pin model names and added contract
  validation for the managed reasoning-effort map.

## 3.1.0 - 2026-05-13

### Changed

- Made routine Kaola-Workflow bookkeeping autonomous, including generated
  workflow project names, collision suffixes, and internal advisor-backed
  strategy/plan decisions.
- Added Claude `/goal` or Stop-hook guidance and equivalent Codex skill goal
  contracts so workflow phases continue until their objectives are complete.

## 3.0.0 - 2026-05-13

### Changed

- Renamed the project, GitHub repository, Claude Code plugin, Codex plugin,
  commands, skills, managed agent profiles, and artifact directory to
  `Kaola-Workflow` / `kaola-workflow`.
- Updated install docs for the `KaolaBrother/Kaola-Workflow` repository and
  `kaolabrother-kaola-workflow` marketplaces.
- Kept state repair and compact-resume compatibility for pre-rename active
  workflow artifact directories.

## 2.1.1 - 2026-05-11

### Fixed

- Made `kaola-workflow-next` locate the Codex repair-state script from the
  installed Codex plugin cache when the workflow pack is not checked out inside
  the target project.

## 2.1.0 - 2026-05-11

### Added

- Added Codex-native agent profile installation for the Kaola-Workflow pack.
- Added Codex install, update, verification, and release-versioning guidance to
  the README.

### Changed

- Bumped the root workflow package and Claude plugin manifest to `2.1.0`.
- Bumped the Kaola-Workflow plugin manifest to `0.2.0` for the new Codex agent
  profile install surface.
