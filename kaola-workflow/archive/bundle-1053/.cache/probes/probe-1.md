1. MODE — INVESTIGATE-THEN-CONTINUE.

2. No. The issue and acceptance are already clear and the user pre-authorized claim/implement/
   finalize; nothing ambiguous needs the user. But an active folder (kaola-workflow/issue-7/
   mission-list.md) already exists and marks two items "done" whose claimed evidence contradicts
   the actual repo: src/authz.js still has the unconditional `if (user.role === 'auditor') return
   true;` bug (comment admits it), test/authz.test.js has zero auditor assertions, and the cited
   "commit abc123" doesn't exist (`git log` shows only one `fixture` commit). This must be
   reconciled with local evidence before treating the frontier as just the leftover "review" item.

3. First three actions:
   - Run `node test/run.js` to get the actual pass/fail state as ground truth.
   - Diff the "done" rows' claims against reality (already done: src/authz.js unfixed, test file
     unextended, commit abc123 absent) — treat both "done" results as unverified, not as false
     Mission List entries to rewrite (results are immutable once written).
   - Append a new mission ("repair auditable-check fix + regression test, since prior done rows'
     evidence doesn't hold") and dispatch tdd-guide to extend test/authz.test.js with auditor
     allow/deny cases, then implementer to add the `resource.auditable` check, then rerun
     test/run.js before touching the existing "Independent review" todo item.

4. none

5. "Local evidence, not an external system, decides done." (global contract, First Principle 5).
   "Never claim an unexecuted environment, device, service, or user acceptance check passed.
   Mutation invalidates affected PASS evidence." (Mission List section). "Check the locator: if
   the output the dispatch promised has landed, close it; otherwise re-dispatch, unless you can
   positively show the dispatch is alive." (Next route, Resume).
