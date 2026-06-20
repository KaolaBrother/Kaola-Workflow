evidence-binding: n5-finalize 8ef3c23fd0a0
compliance: main-session-direct
note: finalize sink node — the in-plan sink bookkeeping is performed by the main session (plan-run contract). The full finalization procedure (prerequisite barrier RC/GV/BC/VC, chain receipt, run-gap sweep, archive, roadmap, attribution sweep, sink) runs under /kaola-workflow-finalize. n3 code-review R1 (opencode mirror propagation) resolved before this close: mirror regenerated, A6 green, verdict:pass.
