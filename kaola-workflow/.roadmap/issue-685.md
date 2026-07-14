issue: #685
title: enhancement(scripts): writeFileAtomicReplace never fsyncs the parent directory — a settled review transaction can revert after power loss (deferred #682 R17)
status: open
workflow_project: —
next_step: Deferred #682 R17 (D-682-01): writeFileAtomicReplace (adaptive-schema.js:1168; kaola-workflow-claim.js sibling) fsyncs the tmp file but never the parent directory, so a settled review-attempts.json transaction can revert after power loss — un-settling a failed attempt or replaying a consumed repair. Fix (S): parent-dir fsync after rename, platform fail-soft, testable seam; schema is a byte-anchor across 4 editions so four-chain. Full body on GitHub #685.
