# Run gaps observed by the orchestrator, not by the scanner

Each line is one defect this run discovered while doing something else. Seeded here so the sweep
gate compares against what was actually swept rather than against prose nobody checked.

gap: pin-cannot-fail — OverCapFallsBack does not red under its own mutation on this Node version, so the pin cannot fail and is not a pin
gap: dead-mirror-references — production code still names the deleted ROADMAP.md in sink-merge roadmapPathspecs and claim.js archive_stage candidates, harmless but reads as a live claim
gap: fixture-cannot-reach-gate — test-finalize-door T11 roadmap_staged assertion cannot exercise the archiveAddOk gate because its fixture never populates existingPaths
gap: consumer-migration-unbuilt — ADR 0018 step 6 consumer migration is designed and measured but not built, and it carries the deployment risk the record names
