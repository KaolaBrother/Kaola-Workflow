## Final measured correction and closure evidence

PR #1041's final candidate is `58d26e916dd9313f2aa5e671ea463cca1792895e` against base
`b78d006c28a3849b3bcbceffdd1ebc07f2ef5115`. This comment supersedes earlier issue text wherever
the measured implementation differs.

- The Mission List remains ADR 0017's four fields. Missions describe recoverable outcomes or new
  causal classes, not selectors, commands, attempts, roles, models, or scheduler nodes.
- Acceptance custody is independent from execution carrier. The run used #1037's affected-frontier
  convergence, immutable candidate freeze, batched review findings, and exact-SHA re-freeze rules.
- `workflow-init` installs no runtime/global assets and produces the same portable repository result
  for every invoking runtime.
- Active-run adoption is per managed change. A safe authority-layout handoff may apply without
  freezing an unrelated incompatible state; execution-default changes require explicit ephemeral
  plan-bound conversation consent; incompatible state, claim, worktree, Mission List, done results,
  and live dispatch locators remain preserved.
- Repeated reviewer findings were not hidden: R1/R3 were reproduced on `0884a834`, and R4 was
  independently reproduced on `51ebbac2`. The final repair is covered by RED-first transition
  oracles and two independent closure passes on the exact final candidate.

Final evidence:

- Cursor 788 assertions; runtime architecture 798; install-all 275; routing 520; mandatory
  walkthrough 179/179.
- Exact receipt codeTreeHash
  `b737f3efdbc2ad3f9b01737e0b2560b76db0a1445b4e20a1b249bd33b8c1fa54`; Claude, Codex, GitLab,
  and Gitea each exited 0 once with no accepted RED, retry, timeout, signal, or waiver.
- Independent final code review and detached-clone adversarial verification both PASS with zero
  blocking and zero nonblocking findings.
- Gap sweep returned no remaining class.

PR #1041 is ready for the workflow sink and closes this issue with #1039 as one integrated bundle.
