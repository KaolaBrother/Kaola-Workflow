issue: #759
title: feat(adaptive-node): expansion transaction — open-time frontier composition recorded append-only in the ledger, resume-safe
status: queued — epic #757 child 2 (depends on #758)
workflow_project: —
next_step: New adaptive-node subcommand expand-open: takes units[] {role, tier, write surfaces, mode serial|co_open, dependency edges} + the derivation lines (grain/path/join/probe/serializer), appends an EXPANSION RECORD (append-only, monotonically numbered per point) to the ledger, then opens via the EXISTING running-set scheduler. Guard prologue applies. Crash between append and open reconciles via reconcile-running-set roll-forward (idempotent). next-action.js ready-set derivation reads spine + expansion records. Review journal rebinds to (spine plan_hash, expansion id) so re-expansion never orphans a completed journal. Re-expansion is the SAME transaction — no separate machinery.
