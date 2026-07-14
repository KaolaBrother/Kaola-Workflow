issue: #686
title: enhancement(scripts): archived projects strand refs/kaola-workflow/barrier/* forever — archive-time reap + keep-set legacy sweep (239 refs stranded)
status: open
workflow_project: —
next_step: Audit 2026-07-14: 239 refs/kaola-workflow/barrier/* refs stranded across ~42 archived projects — --drop-base is window-locked to pending (D-424-01), archive preserves baseline FILES but never reaps refs, and no sweep enumerates them; group barrier-base refs (dropped after pass) are at zero, confirming omission not design. Fix (M): archive-time reap of exactly the archived project's refs (fail-soft, never blocks finalize) + keep-set-disciplined legacy sweep mirroring the #680 orphan-baseline sweep; document the ref lifecycle; four-chain. Full body on GitHub #686.
