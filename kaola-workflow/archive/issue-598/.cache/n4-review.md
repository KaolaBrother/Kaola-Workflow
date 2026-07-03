evidence-binding: n4-review 8a1ed664eb4e
## n4-review — G1 code-reviewer gate (opus, read-only), holistic

Scope: merged synth fc229372 (legs n1+n2), 26 files / +1967. Static pass over what n3's repros don't cover.

Verification all green: test-install-model-rendering passed; route-reachability 185; validate-script-sync 25 byte-identical groups; canonical walkthrough rc=0; all four contract validators rc=0.

1. Code quality: new TOML helpers follow the file's single-pass fail-closed idiom (repeated key/malformed boolean -> ambiguous/false; unterminated inline object -> invalid); parseTopLevelModelReasoningEffort correctly scopes to pre-first-table text (TOML root-key rule, edge pinned by test); deriveDispatchPosture precedence correct (features-gate outranks effort). No copy-paste drift (installer vs preflight bodies textually identical modulo doc-comment).
2. Authored-once: installer x3 md5 7712dd82, preflight x4 md5 8b79c8f1; DISPATCH_POSTURE_VERSION_NOTE byte-identical across hosts and locked by a cross-module equality test; both hosts' derivations run against the same 9 fixtures (divergence reds the suite).
3. Prose: probe-local-then-global unambiguous with both paths named; Gate-Role Degradation Notice actionable (roles, valve, resume path, forbidden anti-pattern); Notice block md5-identical (d0594d44) across all six plan-run surfaces.
4. Validator needles anchored to load-bearing phrases (section header, rationale phrase, forbidden token, valve literal, global path); all three editions incl. the forge-codex dead-zone packs.
5. Tests non-vacuous: strictEqual posture, warning-iff-not-proactive, exit 0 on every posture (NON-FATAL), status: ok ORDERING asserted, remediation-line presence/absence; all new forge test fns registered and invoked.
6. Root Claude command machine-guarded: the codex validator's AC4 needle loop iterates the SKILL AND commands/kaola-workflow-plan-run.md. No propagation gap.
7. Docs/CHANGELOG correctly absent from this merge; provenance scan zero hits on the 12 prose surfaces.

Findings: zero BLOCKING/HIGH/MEDIUM/LOW; three noise observations (substring-subsumed pre-existing needle; security-reviewer notice-only floor faithful to the two-role consent-halt scoping; comment-only divergence on the duplicated derivation).

finding: id=R1 scope=out_of_scope action=none status=open severity=low fix_role=none rationale=pre-existing project-local needle is substring-subsumed by the new global-path needle; prose carries both paths, new needle precise
finding: id=R2 scope=out_of_scope action=none status=open severity=low fix_role=none rationale=security-reviewer-as-hard-gate gets notice-only treatment; faithful to the two-role consent-halt scoping

verdict: pass
findings_blocking: 0
