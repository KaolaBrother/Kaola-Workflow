evidence-binding: c3-finalize 808ddce0e17c

# c3-finalize — sink evidence (main-session-direct)

compliance: main-session-direct (finalize sink is non-delegable; run inline by the orchestrator
per the frozen plan).

## Sink facts

- Feature commit: d4bf9e65 "feat: receipt diet for run-chains — per-step timings, diff-scoped
  finalize chains, hoisted preamble" (9 files, +2167/-304, no closing keywords near #725).
- Chain receipt `.cache/chain-receipt.json`: KAOLA_RUN_CHAINS_CONCURRENCY=serial, headSha
  d4bf9e65, workTreeHash clean, codeTreeHash 158b43a6… — BYTE-MATCH to the c2 fable certifier's
  certified_candidate_digest. All four chains exit 0 first attempt (claude 778s, codex 19s,
  gitlab 95s, gitea 94s). Receipt scope block: decision=all-four, reason=edition_coupling, base
  f92ec240, 7 touched edition paths (including CLAUDE.md via the R1 root read-surface fix), 5
  hoisted preamble steps — the B1 diff-scoping self-test passed live on this run's own diff.
- Gate: c2-code-review (fable) approved, verdict pass, findings_blocking 0, attempt
  review2-3fc0f068…:1 journaled outcome=pass.
- #724 lineage-union attribution proof: 9/9 changed paths attributed across child(c1) +
  epoch-1 parent(n1,n2) plans; synthesized whole-plan barrierCheck pass; evidence
  `.cache/finalize-lineage-barrier.md`. Finalize runs via the scratchpad-patched validator/claim
  copies implementing #724's expected lineage union (Phase-A precedent).
- Run gaps filed this run: #737 (replan child_frozen attestation wedge, NEW); four capture-family
  papercuts folded into #728 (comment 5016615684); AC-B >=50% deferred to Phase E per user
  decision (`.cache/acb-decision.md`); #719/#720/#722/#734 workarounds re-applied verbatim.
- Partial close contract: #725 stays OPEN (Phase C next); #718 untouched.
