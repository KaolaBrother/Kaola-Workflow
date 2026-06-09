# review node (code-reviewer, G1) — issue #284

verdict: pass
findings_blocking: 0

finding: id=R1 scope=out_of_scope action=follow_up status=open severity=low fix_role=none rationale=token-substitution-into-raw-JSON-then-parse-is-outside-the-try/catch;-a-pluginRoot-containing-backslash-or-quote-would-break-JSON.parse-and-fail-install;-no-trigger-on-POSIX-(path.resolve-yields-forward-slashes),-Windows-only
finding: id=R2 scope=out_of_scope action=follow_up status=open severity=low fix_role=none rationale=fresh-install-drops-the-template-$schema-key-(merge-spreads-existing-top-level-keys-but-never-copies-managedHooks.$schema);-cosmetic,-no-test-depends-on-it
finding: id=R3 scope=out_of_scope action=follow_up status=open severity=low fix_role=none rationale=install-merge-only-cleans-managed-entries-under-the-4-currently-managed-events;-if-that-set-ever-shrinks-an-orphaned-kaola-workflow:-entry-under-a-now-unmanaged-event-would-not-be-cleaned-by-install-(uninstall.sh-handles-it-broadly);-latent,-no-trigger-today

## Verdict: APPROVE — clean review, G1 satisfied

Reviewed the complete 18-file change set; verified byte-identity mechanically; empirically exercised the installer merge contract; ran all four edition chains + validate-script-sync — all green.

### Correctness (installer updateHooks())
Proven with an edge-case /tmp fixture (pre-existing custom $schema + stale kaola-workflow:stale-old entry + id-less user entry + unrelated Notification event):
- merge-by-id idempotency: stale managed entry dropped + re-added canonical; 2nd install → exactly one managed entry per event.
- user entries preserved incl. id-less ones (filter !(e.id && e.id.startsWith(...))) and unrelated events.
- __KW_PLUGIN_ROOT__ replaced at ALL occurrences (split/join); tests assert no literal token survives.
- WARN-first on malformed pre-existing hooks.json (try/catch → empty, never throws).
- 3 installers byte-identical (f7eef13c); 3 config/hooks.json differ ONLY in the compact-resume script name.

### Security (G2 correctly not required)
No injection/path-escaping. pluginRoot = path.resolve(__dirname,'..') (code-resolved, not user input); argv[2] feeds only the target path, never the command string; command strings double-quoted. The 2 new bash hooks read JSON from STDIN, parse via node -e with no shell interpolation of payload values, fail-open on every branch. Both new bash hooks byte-identical across all 4 trees (dispatch-log 94919177, phantom-advisor cee811e4). No secrets.

### Cross-edition consistency
validate-script-sync.js groups updated (phantom-advisor + subagent-dispatch-log now list all 4 trees); passes. uninstall.sh mirror is is_managed-style, JSON-decode-tolerant, prunes empty events, documents the install/uninstall PWD asymmetry.

### Compact decision
All 3 compact-resume scripts retain plain stdout; only an identical doc comment added. Correct (Claude Code SessionStart injects plain stdout; envelope not required).

### Test adequacy
Real RED→GREEN, not tautologies: AC1 (token-absence baseline + idempotency w/ surviving seeded user entry), AC3 (attestation flips to attested only when dispatch-log seeded), AC2 (asserts stdout NOT a JSON envelope + plain packet lines), AC4 (producer writes exactly one JSONL line + exit 0/no-write on empty stdin). Codex chain runs all four #284 cases green. Stale "M1 deferred to #266" comment corrected in both gitlab + gitea sims (which now also assert config/hooks.json registers the SubagentStart dispatch-log).

### Findings: 0 CRITICAL, 0 HIGH, 0 MEDIUM, 3 LOW (all out_of_scope follow-ups, non-blocking).
