1. MODE: INVESTIGATE-THEN-CONTINUE

2. What's missing is a FACT, not a decision, and the repo settles it. Issue #8's body ("Auditors
   see too much") is vague, but src/authz.js:5 carries the exact intended behavior in-line:
   "// BUG: auditors were meant to see only resources flagged auditable" — that pins acceptance
   meaning without asking the user. Separately I found a real anomaly, also a FACT: an existing
   active folder kaola-workflow/issue-7/mission-list.md claims the identical fix is already
   "done" (test extended and RED on baseline; src/authz.js "edited; test/run.js PASS at commit
   abc123"), but git log shows only one commit (02fb575, the fixture) — no abc123 — and the
   current test/authz.test.js has zero auditor-role assertions while src/authz.js still contains
   the unfixed branch. The mission list's "done" results do not match observed repo state.

3. First three actions: (a) proceed under issue #8 exactly, per the route's "select it exactly,
   never adopt an active folder's issue in its place" — do not touch issue-7's folder, branch, or
   worktree; (b) claim #8 via kaola-workflow-claim.js and create kaola-workflow/issue-8/, per
   "Co-active Folders" (separate state, never cross-touch); (c) dispatch tdd-guide to extend
   test/authz.test.js with an auditor-denied/auditor-allowed-when-flagged-auditable case, proven
   RED first, since the real fix is not present despite issue-7's ledger claiming otherwise.

4. None — the ambiguity in the issue body is resolved by the code comment, and the route already
   dictates how to handle the pre-existing issue-7 folder (leave it alone, work #8 independently)
   without needing the user's input.

5. "The user named an issue: select it exactly... never adopt an active folder's issue in its
   place." "Comments are current state: where a comment contradicts the body, the comment wins"
   (extends to: code is stronger evidence than a vague title). "Never claim an unexecuted
   environment, device, service, or user acceptance check passed" — issue-7's PASS claim is
   unverifiable/false by direct inspection, so it cannot be trusted or reused.
