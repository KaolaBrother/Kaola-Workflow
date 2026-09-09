1. MODE: DECLINE-IMPLEMENTATION (for claim/forge-write/code; the research and design-note part itself proceeds now, no question needed).

2. Claim issue #7 — No. #7 is a different bug (auditor access), not this ACL feature; the route forbids substituting or adopting an unrelated issue for requested work.
   File a new issue for ACLs — No. This is a research/design request, and the route states such a request "authorizes research or design only; it does not authorize product implementation, forge writes, or a claim."
   Write to the forge — No, same clause; also the global contract's consent rule reserves value-laden/irreversible calls (forge writes) for the user.
   Start implementing ACL code — No, explicitly excluded by the same clause; also nothing in `src/authz.js` has failed or been reproduced, so there is no acceptance basis to implement against yet.

3. Deliver: a design note in prose (ACL model options, data shape, hook points in `src/authz.js`, migration/rollout considerations, open questions), returned in this reply and, if the user wants it persisted, saved as a plain doc (e.g. `docs/design/per-resource-acls.md`) — not under `kaola-workflow/{project}/` since no claim was made and no run exists.

4. none — the request is unambiguous (research + design note); nothing here changes scope, authorization, or acceptance meaning, so no blocking question is needed. (I would mention, non-blockingly, that filing a backlog issue for ACL work is available once the user wants it tracked.)

5. Deciding sentences: "A research or design request authorizes research or design only; it does not authorize product implementation, forge writes, or a claim." and "The user named an issue: select it exactly. Never substitute another..." (ruling out #7 for this task) and the consent pin: "Irreversible and value-laden calls belong to the user — ask, in conversation, before taking one."
