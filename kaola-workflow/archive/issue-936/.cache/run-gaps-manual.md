# Run gaps — issue-936

Defects this run discovered that are outside #936's scope. Each was reproduced against the real
scripts with a mock forge; recipes are in `.cache/reachability.md`. The scanner observes none of
these automatically, so they are seeded here.

gap: unreconciled-project-slug — clearAdvisoryClaim keys its marker deletion on the operator-supplied --project, which finalize never reconciles against the durable record: a case-variant slug under-deletes at exit 0 with no warning (reproduced, E7e), and a MISSING slug falls back to a generic regex that deletes every project's marker.

gap: offline-finalize-reports-closed — an OFFLINE finalize returns skipped_offline before touching the forge yet still emits status: closed, leaving both claim artifacts on every member (reproduced, E3c). The claim was posted while online, so the run walks away from live remote state while reporting success.

gap: finalize-refusal-before-claim-clear — six cmdFinalize refusal paths return before the claim-clearing loop at claim.js:4605. Recorded with its premise in doubt: keeping the claim on a refusal is plausibly correct, and its only measured hazard was the sink no-op that #936 fixed.

gap: undiscriminating-blocked-message — the classifier emits the same "issue #N has a remote workflow claim" whether the label or the marker blocked, and blocked is label-first-OR-marker. An operator cannot tell which artifact to clear, nor that one self-heals in 24h while the other never does. This is what left #936's reporter unable to diagnose their own symptom.
