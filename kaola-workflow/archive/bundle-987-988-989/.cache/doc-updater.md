# doc-updater — NOT DISPATCHED

Subagents were declined for this entire run (session instruction: no agent dispatch unless the user
asks for it). The design treats subagents as offered and declinable, so the run finishes without
one; the documentation work it would have done was done inline and is recorded in
`.cache/doc-docking.md`, which carries the changed-file table, the documents checked, the one gap
found and fixed (`docs/api.md`'s claim that finalize still stages the mirror), and the
deliberately-unchanged set with reasons.

Test custody is unaffected by that decision here: #988 is a removal that owes no new pin, and
#989/#987 are test-artifact work rather than production behaviour whose tests the implementer would
be authoring. Where a pin WAS written (#989's three T11 assertions), it is mutation-proven in both
directions rather than resting on authorship.
