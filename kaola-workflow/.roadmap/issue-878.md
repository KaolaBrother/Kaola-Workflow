issue: #878
title: Watch list: derived-but-never-observed mechanisms — do not build speculatively (ADR 0017)
status: open
workflow_project: —
next_step: REFERENCE ONLY — do not schedule. Consult when one of its failure classes is observed. Two rows now have their sizing in git history rather than in live code: the project scheduler lock (acquireProjectLock / probeLockLiveness, the 'two honest live writers' row) and the durable consent valve (the halt marker, its two journals and consentScopeDigest, the 'value call taken by the agent' row). Both were deleted with the node executor because what forced them to exist was the running-set scheduler and a plan-scoped halt; recover them from the commit before the ADR 0017 build if either class is ever observed.
