1. Frontier: row 1 (acceptance test authored, RED on baseline) = done, trusted as-is. Row 2 (fix src/authz.js, PASS at abc123) = done, but its PASS evidence no longer describes the current bytes. Row 3 (independent review of the frozen candidate) = todo, and it cannot proceed as written because there is no longer a frozen candidate — the branch carries uncommitted edits past abc123.

2. No. The auditor-condition change is a substantive edit to the same code path the acceptance test covers, made after the PASS was recorded. "Mutation invalidates affected PASS evidence for changed bytes" applies directly. The reformat alone might be behavior-preserving, but I can't assume that without diffing — and the condition change is not cosmetic, so the recorded PASS is stale for current bytes.

3. Add a NEW mission row; do not rewrite the done row. The fix mission is closed and its result is immutable ("A completed item and its result are immutable"). The post-close edits are a newly discovered causal event on the same file — re-verifying them is a new recoverable outcome, not a continuation of a closed mission. The existing todo review row also can't just proceed against dirty bytes; the new mission (re-run acceptance on current bytes) gates it.

4. First three actions:
   - Diff current src/authz.js against abc123 to separate the reformat from the semantic auditor-condition change.
   - Append a new mission row: "Re-validate authz fix after post-close edits (reformat + auditor condition) on current bytes," status todo, then in-flight with locator before dispatching/running.
   - Re-run test/authz.test.js and test/run.js against the current (uncommitted) bytes and record that result before letting row 3's review touch the candidate.

5. Deciding sentences: "any mutation invalidates prior PASS evidence for changed bytes" (Run it, Next route) and "Never claim an unexecuted environment, device, service, or user acceptance check passed. Mutation invalidates affected PASS evidence" (global contract, Mission List). "A completed item and its result are immutable" and "Append a mission only for a new recoverable outcome ... or for a newly discovered independent causal class" (both routes, Mission List) settle the new-row-not-rewrite choice.
