evidence-binding: n4-review 98d97d23e50c
# n4-review — code-reviewer gate (opus, REDISPATCH) over issue-606 (n1-detect + n2-prose + n3-docs)

Scope: full branch diff vs merge-base d94d373a (18 files, +513/-0), reviewed against the issue ACs and non-goals. A prior reviewer instance terminated without delivering; this is a fresh, complete review trusting nothing from it.

verdict: pass
findings_blocking: 0

## Load-bearing negatives — both verified

1. Report-only boundary HELD: detect_claude_dispatch_posture() (install.sh:768) opens the three settings paths read-mode only, never writes; non-fatal on every path (env probe / python3 fallback / python3 absent); the report block is pure echo. Test asserts settings byte-unchanged (cases c+d).
2. Zero behavior change HELD: grep over scripts/ + plugins/*/scripts/ shows the flag only in install.sh (report) and the install test; no scheduler/gate/barrier reads it; classic presented as the unchanged default on all six surfaces.

## Other checks — clean

3. Six-surface parity: #### Teammate-Mode Dispatch byte-identical across all six (sha 9d782062); one-nudge idle-race sentence verbatim; needles pin per edition (route-reachability T14 + 5 validators); removal reds the owning chain.
4. Byte-pair wall: posture blockquote at commands/workflow-init.md:186, outside KW-CLAUDE-TEMPLATE (77-162); the 3 kaola-workflow-init SKILL packs byte-unchanged; forge-pair identity green in chains.
5. PROVENANCE_BAN clean on all prompt surfaces + install.sh echoed text; D-606-01.md (provenance home) accurately reflects the landed impl (env-probe precedence, settings order, $PWD scope, non-goals).
6. Remediation wording classic-led and consistent between install.sh and the workflow-init note.

Minor (non-blocking): CHANGELOG has no issue-606 entry yet — correct; it is the n5-finalize artifact (write before the finalize chain run).

## Verification record — sequential, real exit codes

- npm run test:kaola-workflow:claude exit 0 (walkthrough passed; active-folders parity 61)
- npm run test:kaola-workflow:codex exit 0
- npm run test:kaola-workflow:gitlab exit 0
- npm run test:kaola-workflow:gitea exit 0
