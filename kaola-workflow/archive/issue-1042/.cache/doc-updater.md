verdict: DOCKED
candidate: f07b268a5acdab32b3a75d2d87c16af9c176df17a04efef43a39ce0b25587c0d

An independent documentation audit reviewed all 30 changed files and found no gap. AGENTS.md,
README.md, CHANGELOG.md, docs/architecture.md, and ADR 0017 carry the changed public wording.
docs/api.md is unchanged because no API, schema, flag, or envelope changed. docs/conventions.md is
unchanged because it already delegates Mission List semantics to ADR 0017 and no new convention or
mechanism was introduced. Generated routing surfaces byte-match their canonical skeletons.
