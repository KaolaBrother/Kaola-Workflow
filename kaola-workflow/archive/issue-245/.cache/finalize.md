# finalize (sink) — issue-245

The finalize sink appended the #245 entry to `CHANGELOG.md` under the `[Unreleased]` heading (inserted immediately after `## [Unreleased]`, before the `## [5.2.0]` block). This is a docs/state-only change: the entry records the canonical `kaola_script()` resolver insertion into the adaptive skill + the three edition adapt command files. No source or code file was touched by the finalize node — its declared write set is exactly `CHANGELOG.md`.
